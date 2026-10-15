import {
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "@apice/domain";
import { z } from "zod";
import type { Identity, IdentityStore } from "../database/identity-store.js";
import type { MailService } from "./mail.service.js";

const challengeId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const mfaVerifySchema = z
  .object({ challengeId, code: z.string().regex(/^\d{6}$/) })
  .strict();
export const mfaChallengeSchema = z.object({ challengeId }).strict();
export const mfaEmailSchema = z
  .object({
    challengeId,
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export interface MfaChallenge {
  requiresSecondFactor: true;
  challengeId: string;
  maskedEmail: string;
  needsEmail: boolean;
  expiresAt: number;
}
interface ChallengeRow {
  token_hash: string;
  tenant_id: string;
  user_id: string;
  password_version: string;
  pending_email: string | null;
  code_hash: string | null;
  expires_at: Date;
  last_sent_at: Date | null;
  sends: number;
  attempts: number;
  delivery_pending: boolean;
  consumed_at: Date | null;
  current_password_version: string;
  active: boolean;
}
const expired = () =>
  new UnauthorizedException("Código inválido ou expirado. Entre novamente.");
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const makeCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
const maskEmail = (email: string | null) => {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return `${local!.slice(0, 1)}***@${domain}`;
};

@Injectable()
export class EmailMfaService implements OnModuleDestroy {
  private readonly tenantId: string;
  constructor(
    private readonly pool: Pool | undefined,
    private readonly identities: IdentityStore,
    private readonly mail: MailService,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {
    this.tenantId = env.PORTAL_TENANT_ID ?? "apice-demo";
    this.pool?.on("error", () =>
      console.warn(
        "Conexão de verificação interrompida; novas operações tentarão reconectar.",
      ),
    );
  }
  async onModuleDestroy() {
    await this.pool?.end();
  }
  private key() {
    if (!this.pool || !/^[a-fA-F0-9]{64}$/.test(this.env.MFA_SECRET ?? ""))
      throw new ServiceUnavailableException(
        "Verificação por e-mail ainda não configurada. Procure o administrador.",
      );
    return Buffer.from(this.env.MFA_SECRET!, "hex");
  }
  private digest(tokenHash: string, code: string) {
    return createHmac("sha256", this.key())
      .update(`${tokenHash}:${code}`)
      .digest("hex");
  }
  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.key();
    const client = await this.pool!.connect();
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
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException(
          "E-mail não disponível para este cadastro. Procure o administrador.",
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private response(
    token: string,
    row: { pending_email: string | null; expires_at: Date },
  ): MfaChallenge {
    return {
      requiresSecondFactor: true,
      challengeId: token,
      maskedEmail: maskEmail(row.pending_email),
      needsEmail: !row.pending_email,
      expiresAt: row.expires_at.getTime(),
    };
  }
  private async row(client: PoolClient, token: string): Promise<ChallengeRow> {
    if (!challengeId.safeParse(token).success) throw expired();
    const result = await client.query<ChallengeRow>(
      "SELECT m.*,c.active,c.password_version::text AS current_password_version FROM portal.email_mfa_challenges m JOIN portal.credentials c ON c.tenant_id=m.tenant_id AND c.user_id=m.user_id WHERE m.tenant_id=$1 AND m.token_hash=$2 FOR UPDATE OF m,c",
      [this.tenantId, hashToken(token)],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.consumed_at ||
      row.expires_at.getTime() <= Date.now() ||
      row.attempts >= 5 ||
      !row.active ||
      row.password_version !== row.current_password_version
    )
      throw expired();
    return row;
  }
  private async send(tokenHash: string, email: string, code: string) {
    try {
      await this.mail.sendVerification(email, code);
    } catch {
      await this.transaction(async (client) => {
        await client.query(
          "UPDATE portal.email_mfa_challenges SET consumed_at=now(),delivery_pending=false WHERE tenant_id=$1 AND token_hash=$2",
          [this.tenantId, tokenHash],
        );
      });
      throw new ServiceUnavailableException(
        "Não foi possível enviar o código. Procure o administrador ou tente novamente mais tarde.",
      );
    }
    await this.transaction(async (client) => {
      await client.query(
        "UPDATE portal.email_mfa_challenges SET delivery_pending=false WHERE tenant_id=$1 AND token_hash=$2 AND consumed_at IS NULL",
        [this.tenantId, tokenHash],
      );
    });
  }
  async begin(identity: Identity): Promise<MfaChallenge> {
    this.key();
    if (identity.actor.tenantId !== this.tenantId || !identity.passwordVersion)
      throw expired();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const code = makeCode();
    const row = await this.transaction(async (client) => {
      const result = await client.query<{
        email: string | null;
        password_version: string;
        active: boolean;
      }>(
        "SELECT email,password_version::text,active FROM portal.credentials WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE",
        [this.tenantId, identity.actor.userId],
      );
      const account = result.rows[0];
      if (
        !account?.active ||
        account.password_version !== identity.passwordVersion
      )
        throw expired();
      const counts = await client.query<{ recent: string; total: string }>(
        "SELECT count(*) FILTER (WHERE user_id=$2 AND created_at>now()-interval '15 minutes')::text AS recent,count(*) FILTER (WHERE consumed_at IS NULL AND expires_at>now())::text AS total FROM portal.email_mfa_challenges WHERE tenant_id=$1",
        [this.tenantId, identity.actor.userId],
      );
      if (
        Number(counts.rows[0]!.recent) >= 5 ||
        Number(counts.rows[0]!.total) >= 100
      )
        throw new HttpException(
          "Aguarde antes de iniciar outra verificação.",
          429,
        );
      const inserted = await client.query<ChallengeRow>(
        "INSERT INTO portal.email_mfa_challenges(token_hash,tenant_id,user_id,password_version,pending_email,code_hash,expires_at,last_sent_at,sends,delivery_pending) VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes',CASE WHEN $5::text IS NULL THEN NULL ELSE now() END,CASE WHEN $5::text IS NULL THEN 0 ELSE 1 END,$5::text IS NOT NULL) RETURNING *",
        [
          tokenHash,
          this.tenantId,
          identity.actor.userId,
          identity.passwordVersion,
          account.email,
          account.email ? this.digest(tokenHash, code) : null,
        ],
      );
      return inserted.rows[0]!;
    });
    if (row.pending_email) await this.send(tokenHash, row.pending_email, code);
    return this.response(token, row);
  }
  async enroll(token: string, email: string): Promise<MfaChallenge> {
    const parsed = mfaEmailSchema.parse({ challengeId: token, email });
    const code = makeCode();
    const updated = await this.transaction(async (client) => {
      const row = await this.row(client, parsed.challengeId);
      if (row.pending_email || row.sends !== 0)
        throw new ConflictException(
          "Este cadastro já tem um endereço para a verificação.",
        );
      const result = await client.query<ChallengeRow>(
        "UPDATE portal.email_mfa_challenges SET pending_email=$3,code_hash=$4,last_sent_at=now(),sends=1,delivery_pending=true WHERE tenant_id=$1 AND token_hash=$2 RETURNING *",
        [
          this.tenantId,
          row.token_hash,
          parsed.email,
          this.digest(row.token_hash, code),
        ],
      );
      return result.rows[0]!;
    });
    await this.send(updated.token_hash, parsed.email, code);
    return this.response(token, updated);
  }
  async resend(token: string): Promise<MfaChallenge> {
    const code = makeCode();
    const updated = await this.transaction(async (client) => {
      const row = await this.row(client, token);
      if (!row.pending_email)
        throw new ConflictException("Informe seu e-mail para continuar.");
      if (
        row.delivery_pending ||
        row.sends >= 3 ||
        (row.last_sent_at && Date.now() - row.last_sent_at.getTime() < 60_000)
      )
        throw new HttpException(
          "Aguarde um minuto para reenviar. São permitidos três envios por verificação.",
          429,
        );
      const result = await client.query<ChallengeRow>(
        "UPDATE portal.email_mfa_challenges SET code_hash=$3,last_sent_at=now(),sends=sends+1,delivery_pending=true WHERE tenant_id=$1 AND token_hash=$2 RETURNING *",
        [this.tenantId, row.token_hash, this.digest(row.token_hash, code)],
      );
      return result.rows[0]!;
    });
    await this.send(updated.token_hash, updated.pending_email!, code);
    return this.response(token, updated);
  }
  async verify(token: string, code: string): Promise<Identity> {
    if (!mfaVerifySchema.safeParse({ challengeId: token, code }).success)
      throw expired();
    const result = await this.transaction(async (client) => {
      const row = await this.row(client, token);
      if (!row.pending_email || !row.code_hash || row.delivery_pending)
        throw expired();
      const matches = timingSafeEqual(
        Buffer.from(row.code_hash, "hex"),
        Buffer.from(this.digest(row.token_hash, code), "hex"),
      );
      if (!matches) {
        await client.query(
          "UPDATE portal.email_mfa_challenges SET attempts=attempts+1,consumed_at=CASE WHEN attempts+1>=5 THEN now() ELSE consumed_at END WHERE tenant_id=$1 AND token_hash=$2",
          [this.tenantId, row.token_hash],
        );
        return { valid: false as const };
      }
      // The address is bound only after proof of mailbox control, never at the password stage.
      await client.query(
        "UPDATE portal.credentials SET email=COALESCE(email,$3),email_verified=true,updated_at=now() WHERE tenant_id=$1 AND user_id=$2 AND (email IS NULL OR email=$3)",
        [this.tenantId, row.user_id, row.pending_email],
      );
      const account = await client.query<{ email: string }>(
        "SELECT email FROM portal.credentials WHERE tenant_id=$1 AND user_id=$2",
        [this.tenantId, row.user_id],
      );
      if (account.rows[0]?.email !== row.pending_email) throw expired();
      await client.query(
        "UPDATE portal.email_mfa_challenges SET consumed_at=now() WHERE tenant_id=$1 AND token_hash=$2",
        [this.tenantId, row.token_hash],
      );
      return {
        valid: true as const,
        actor: { tenantId: this.tenantId, userId: row.user_id } as Actor,
        passwordVersion: row.password_version,
      };
    });
    if (!result.valid) throw expired();
    const identity = await this.identities.resolve(result.actor);
    if (identity.passwordVersion !== result.passwordVersion) throw expired();
    return identity;
  }
}
