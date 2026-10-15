import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import type { PoolClient } from "pg";
import type { Actor } from "@apice/domain";
import { hashPassword } from "./password.js";
import { MailService } from "./mail.service.js";

export function newRecoveryToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: recoveryTokenHash(token) };
}
export function recoveryTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
interface RecoveryAccount {
  user_id: string;
  email: string;
  password_version: string;
  payload: Actor;
}
interface ResetAccount extends RecoveryAccount {
  issued_password_version: string;
}
interface Delivery {
  token: string;
  hash: string;
  email: string;
}

export class RecoveryService implements OnModuleDestroy {
  private readonly pool?: pg.Pool;
  private readonly pending = new Set<Promise<void>>();
  private inFlight = 0;
  constructor(
    connectionString: string | undefined,
    private readonly mail: MailService,
    private readonly tenantId = "apice-demo",
    pool?: pg.Pool,
  ) {
    this.pool =
      pool ??
      (connectionString
        ? new pg.Pool({
            connectionString,
            max: 4,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 10000,
          })
        : undefined);
    this.pool?.on("error", () => {
      console.warn(
        "Conexão de recuperação interrompida; uma nova operação tentará reconectar.",
      );
    });
  }
  async onModuleDestroy() {
    await this.waitForDeliveries();
    await this.pool?.end();
  }
  // Also lets isolated tests wait for delivery without exposing tokens via HTTP.
  async waitForDeliveries(): Promise<void> {
    await Promise.allSettled([...this.pending]);
  }
  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool)
      throw new ServiceUnavailableException(
        "Recuperação de senha exige o banco PostgreSQL.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
        this.tenantId,
      ]);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [this.tenantId],
      );
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async audit(
    client: PoolClient,
    actor: Actor,
    action: string,
    detail: string,
  ) {
    const id = randomUUID();
    await client.query(
      "INSERT INTO portal.audit(tenant_id,id,payload) VALUES($1,$2,$3)",
      [
        this.tenantId,
        id,
        {
          id,
          tenantId: this.tenantId,
          actorId: actor.userId,
          actorName: actor.name,
          action,
          detail,
          category: "security",
          at: new Date().toISOString(),
        },
      ],
    );
  }
  private deliver(delivery: Delivery) {
    const job = (async () => {
      try {
        await this.mail.sendReset(delivery.email, delivery.token);
      } catch {
        console.warn(
          "Não foi possível entregar uma solicitação de recuperação de senha.",
        );
        try {
          await this.transaction(async (client) => {
            await client.query(
              "UPDATE portal.password_reset_tokens SET used_at=now() WHERE tenant_id=$1 AND token_hash=$2 AND used_at IS NULL",
              [this.tenantId, delivery.hash],
            );
          });
        } catch {
          console.warn(
            "Não foi possível finalizar uma solicitação de recuperação; ela seguirá limitada pela validade.",
          );
        }
      }
    })();
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
  }
  async forgot(email: string): Promise<{ accepted: true }> {
    const started = performance.now();
    try {
      if (this.pool && this.pending.size + this.inFlight < 20) {
        this.inFlight++;
        let delivery: Delivery | undefined;
        try {
          delivery = await this.transaction<Delivery | undefined>(
            async (client) => {
              const result = await client.query<RecoveryAccount>(
                "SELECT c.user_id,c.email,c.password_version,u.payload FROM portal.credentials c JOIN portal.users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id WHERE c.tenant_id=$1 AND c.email=$2 AND c.active AND c.email_verified FOR UPDATE OF c",
                [this.tenantId, email.toLowerCase()],
              );
              const account = result.rows[0];
              if (!account) return undefined;
              const secret = newRecoveryToken();
              await client.query(
                "UPDATE portal.password_reset_tokens SET used_at=now() WHERE tenant_id=$1 AND user_id=$2 AND used_at IS NULL",
                [this.tenantId, account.user_id],
              );
              await client.query(
                "INSERT INTO portal.password_reset_tokens(token_hash,tenant_id,user_id,password_version,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')",
                [
                  secret.hash,
                  this.tenantId,
                  account.user_id,
                  account.password_version,
                ],
              );
              await this.audit(
                client,
                account.payload,
                "Recuperação de senha solicitada",
                "Link de uso único emitido com validade de 30 minutos.",
              );
              return {
                token: secret.token,
                hash: secret.hash,
                email: account.email,
              };
            },
          );
        } finally {
          this.inFlight--;
        }
        if (delivery) this.deliver(delivery);
      }
    } catch {
      console.warn("Solicitação de recuperação de senha não concluída.");
    }
    // Mail delivery does not influence response timing or its public contents.
    await delay(
      Math.max(
        0,
        300 + (randomBytes(1)[0]! % 51) - (performance.now() - started),
      ),
    );
    return { accepted: true };
  }
  async reset(token: string, newPassword: string): Promise<{ reset: true }> {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token)) throw this.invalidToken();
    return this.transaction(async (client) => {
      const hash = recoveryTokenHash(token);
      const result = await client.query<ResetAccount>(
        "SELECT c.user_id,c.email,c.password_version,u.payload,t.password_version AS issued_password_version FROM portal.password_reset_tokens t JOIN portal.credentials c ON c.tenant_id=t.tenant_id AND c.user_id=t.user_id JOIN portal.users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id WHERE t.token_hash=$1 AND t.tenant_id=$2 AND t.used_at IS NULL AND t.expires_at>clock_timestamp() AND c.active AND c.email_verified FOR UPDATE OF t,c",
        [hash, this.tenantId],
      );
      const account = result.rows[0];
      if (
        !account ||
        account.password_version !== account.issued_password_version
      )
        throw this.invalidToken();
      const encoded = await hashPassword(newPassword);
      await client.query(
        "UPDATE portal.credentials SET password_hash=$3,must_change_password=false,password_version=password_version+1,updated_at=now() WHERE tenant_id=$1 AND user_id=$2",
        [this.tenantId, account.user_id, encoded],
      );
      await client.query(
        "UPDATE portal.password_reset_tokens SET used_at=now() WHERE tenant_id=$1 AND user_id=$2 AND used_at IS NULL",
        [this.tenantId, account.user_id],
      );
      await this.audit(
        client,
        account.payload,
        "Senha recuperada",
        "Senha redefinida por link de uso único; sessões anteriores foram invalidadas.",
      );
      return { reset: true as const };
    });
  }
  private invalidToken() {
    return new BadRequestException(
      "Link inválido ou expirado. Solicite uma nova recuperação de senha.",
    );
  }
}
