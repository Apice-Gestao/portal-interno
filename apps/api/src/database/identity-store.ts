import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { PoolClient } from "pg";
import type { Actor, Department, Permission, Role } from "@apice/domain";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "../security/password.js";
import { validateAccountPermissions } from "../security/identity.schemas.js";

export interface AccountUser extends Actor {
  username: string;
  email?: string;
  permissions: Permission[];
  active: boolean;
  mustChangePassword: boolean;
}
export interface AccountInput {
  name: string;
  username: string;
  email: string;
  password: string;
  departments: Department[];
  permissions: Permission[];
  role: Role;
}
export type AccountUpdate = Partial<AccountInput> & { active?: boolean };
export interface Identity {
  actor: Actor;
  mustChangePassword: boolean;
  passwordVersion?: string;
  email?: string;
  emailVerified?: boolean;
}
interface IdentityRow {
  payload: Actor;
  login: string;
  email: string | null;
  email_verified: boolean;
  password_hash: string;
  active: boolean;
  must_change_password: boolean;
  password_version: string;
}
const identitySelect =
  "SELECT u.payload,c.login,c.email,c.email_verified,c.password_hash,c.active,c.must_change_password,c.password_version FROM portal.credentials c JOIN portal.users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id WHERE c.tenant_id=$1";
const actorOf = (row: IdentityRow): Actor => ({
  ...row.payload,
  permissions: row.payload.permissions ?? [],
});
const accountOf = (row: IdentityRow): AccountUser => ({
  ...actorOf(row),
  permissions: row.payload.permissions ?? [],
  username: row.login,
  email: row.email ?? undefined,
  active: row.active,
  mustChangePassword: row.must_change_password,
});
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export abstract class IdentityStore {
  abstract authenticate(username: string, password: string): Promise<Identity>;
  abstract resolve(actor: Actor): Promise<Identity>;
  abstract changePassword(
    actor: Actor,
    currentPassword: string,
    newPassword: string,
  ): Promise<Identity>;
  abstract list(actor: Actor): Promise<AccountUser[]>;
  abstract create(actor: Actor, input: AccountInput): Promise<AccountUser>;
  abstract update(
    actor: Actor,
    userId: string,
    input: AccountUpdate,
  ): Promise<AccountUser>;
}

export class UnavailableIdentityStore extends IdentityStore {
  private unavailable(): never {
    throw new ServiceUnavailableException(
      "Login por senha exige o banco PostgreSQL configurado.",
    );
  }
  authenticate(): Promise<Identity> {
    return this.unavailable();
  }
  resolve(): Promise<Identity> {
    return this.unavailable();
  }
  changePassword(): Promise<Identity> {
    return this.unavailable();
  }
  list(): Promise<AccountUser[]> {
    return this.unavailable();
  }
  create(): Promise<AccountUser> {
    return this.unavailable();
  }
  update(): Promise<AccountUser> {
    return this.unavailable();
  }
}

export class PostgresIdentityStore
  extends IdentityStore
  implements OnModuleDestroy
{
  private readonly pool: pg.Pool;
  private readonly tenantId: string;
  constructor(connectionString: string, tenantId = "apice-demo") {
    super();
    this.tenantId = tenantId;
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    this.pool.on("error", () => {
      console.warn(
        "Conexão de identidade interrompida; novas operações tentarão reconectar.",
      );
    });
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  private async transaction<T>(
    tenantId: string,
    write: boolean,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(write ? "BEGIN" : "BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
        tenantId,
      ]);
      if (write)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [tenantId],
        );
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505")
        throw new ConflictException("Nome de usuário já utilizado.");
      throw error;
    } finally {
      client.release();
    }
  }
  private async row(client: PoolClient, actor: Actor): Promise<IdentityRow> {
    const result = await client.query<IdentityRow>(
      `${identitySelect} AND c.user_id=$2`,
      [actor.tenantId, actor.userId],
    );
    const row = result.rows[0];
    if (!row?.active)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    return row;
  }
  private async manager(client: PoolClient, actor: Actor): Promise<Actor> {
    const row = await this.row(client, actor);
    const current = actorOf(row);
    if (
      row.must_change_password ||
      !current.permissions?.includes("users.manage")
    )
      throw new ForbiddenException("Sem permissão para gerenciar usuários.");
    return current;
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
        actor.tenantId,
        id,
        {
          id,
          tenantId: actor.tenantId,
          actorId: actor.userId,
          actorName: actor.name,
          action,
          detail,
          at: new Date().toISOString(),
          category: "security",
        },
      ],
    );
  }
  async authenticate(username: string, password: string): Promise<Identity> {
    return this.transaction(this.tenantId, false, async (client) => {
      const result = await client.query<IdentityRow>(
        `${identitySelect} AND c.login=$2`,
        [this.tenantId, username.toLowerCase()],
      );
      const row = result.rows[0];
      const verified = await verifyPassword(
        password,
        row?.password_hash ?? DUMMY_PASSWORD_HASH,
      );
      if (!row?.active || !verified)
        throw new UnauthorizedException("Usuário ou senha inválidos.");
      // Re-read after hashing: a concurrent reset/deactivation must take effect now.
      const current = await this.row(client, row.payload);
      if (current.password_hash !== row.password_hash)
        throw new UnauthorizedException("Usuário ou senha inválidos.");
      return {
        actor: actorOf(current),
        mustChangePassword: current.must_change_password,
        passwordVersion: current.password_version,
        email: current.email ?? undefined,
        emailVerified: current.email_verified,
      };
    });
  }
  async resolve(actor: Actor): Promise<Identity> {
    return this.transaction(actor.tenantId, false, async (client) => {
      const row = await this.row(client, actor);
      return {
        actor: actorOf(row),
        mustChangePassword: row.must_change_password,
        passwordVersion: row.password_version,
        email: row.email ?? undefined,
        emailVerified: row.email_verified,
      };
    });
  }
  async changePassword(
    actor: Actor,
    currentPassword: string,
    newPassword: string,
  ): Promise<Identity> {
    return this.transaction(actor.tenantId, true, async (client) => {
      const row = await this.row(client, actor);
      if (!(await verifyPassword(currentPassword, row.password_hash)))
        throw new UnauthorizedException("Senha atual inválida.");
      if (currentPassword === newPassword)
        throw new ConflictException("Escolha uma senha diferente da atual.");
      const encoded = await hashPassword(newPassword);
      const updated = await client.query<{ password_version: string }>(
        "UPDATE portal.credentials SET password_hash=$3,must_change_password=false,password_version=password_version+1,updated_at=now() WHERE tenant_id=$1 AND user_id=$2 RETURNING password_version",
        [actor.tenantId, actor.userId, encoded],
      );
      await this.audit(
        client,
        actorOf(row),
        "Senha alterada",
        "Senha da conta alterada; outras sessões devem ser revogadas.",
      );
      return {
        actor: actorOf(row),
        mustChangePassword: false,
        passwordVersion: updated.rows[0]!.password_version,
        email: row.email ?? undefined,
        emailVerified: row.email_verified,
      };
    });
  }
  async list(actor: Actor): Promise<AccountUser[]> {
    return this.transaction(actor.tenantId, false, async (client) => {
      await this.manager(client, actor);
      const result = await client.query<IdentityRow>(
        `${identitySelect} ORDER BY lower(u.payload->>'name'),c.login`,
        [actor.tenantId],
      );
      return result.rows.map(accountOf);
    });
  }
  async create(actor: Actor, input: AccountInput): Promise<AccountUser> {
    validateAccountPermissions(input.role, input.permissions);
    const encoded = await hashPassword(input.password);
    return this.transaction(actor.tenantId, true, async (client) => {
      const manager = await this.manager(client, actor);
      const payload: Actor = {
        userId: randomUUID(),
        tenantId: actor.tenantId,
        name: input.name,
        initials: initialsOf(input.name),
        role: input.role,
        departments: input.departments,
        permissions: input.permissions,
        active: true,
      };
      await client.query(
        "INSERT INTO portal.users(tenant_id,id,payload) VALUES($1,$2,$3)",
        [actor.tenantId, payload.userId, payload],
      );
      await client.query(
        "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,email) VALUES($1,$2,$3,$4,$5)",
        [
          actor.tenantId,
          payload.userId,
          input.username.toLowerCase(),
          encoded,
          input.email.toLowerCase(),
        ],
      );
      await this.audit(
        client,
        manager,
        "Usuário criado",
        `Conta ${input.username.toLowerCase()} criada; permissões atribuídas pelo administrador.`,
      );
      return {
        ...payload,
        permissions: input.permissions,
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        active: true,
        mustChangePassword: true,
      };
    });
  }
  async update(
    actor: Actor,
    userId: string,
    input: AccountUpdate,
  ): Promise<AccountUser> {
    const encoded =
      input.password === undefined
        ? undefined
        : await hashPassword(input.password);
    return this.transaction(actor.tenantId, true, async (client) => {
      const manager = await this.manager(client, actor);
      const result = await client.query<IdentityRow>(
        `${identitySelect} AND c.user_id=$2`,
        [actor.tenantId, userId],
      );
      const row = result.rows[0];
      if (!row) throw new ForbiddenException("Usuário não disponível.");
      const payload: Actor = {
        ...row.payload,
        name: input.name ?? row.payload.name,
        role: input.role ?? row.payload.role,
        departments: input.departments ?? row.payload.departments,
        permissions: input.permissions ?? row.payload.permissions ?? [],
        initials: initialsOf(input.name ?? row.payload.name),
      };
      const active = input.active ?? row.active;
      payload.active = active;
      validateAccountPermissions(payload.role, payload.permissions ?? []);
      if (
        row.active &&
        row.payload.permissions?.includes("users.manage") &&
        (!active || !payload.permissions?.includes("users.manage"))
      ) {
        const others = await client.query(
          "SELECT 1 FROM portal.credentials c JOIN portal.users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id WHERE c.tenant_id=$1 AND c.active AND c.user_id<>$2 AND u.payload->'permissions' ? 'users.manage' LIMIT 1",
          [actor.tenantId, userId],
        );
        if (!others.rowCount)
          throw new ConflictException(
            "Mantenha ao menos um administrador ativo com gestão de usuários.",
          );
      }
      await client.query(
        "UPDATE portal.users SET payload=$3 WHERE tenant_id=$1 AND id=$2",
        [actor.tenantId, userId, payload],
      );
      await client.query(
        "UPDATE portal.credentials SET login=$3,active=$4,password_hash=COALESCE($5,password_hash),must_change_password=CASE WHEN $5::text IS NULL THEN must_change_password ELSE true END,password_version=password_version+CASE WHEN $5::text IS NOT NULL OR ($6::text IS NOT NULL AND $6::text IS DISTINCT FROM email) THEN 1 ELSE 0 END,email_verified=CASE WHEN $6::text IS NOT NULL AND $6::text IS DISTINCT FROM email THEN false ELSE email_verified END,email=COALESCE($6,email),updated_at=now() WHERE tenant_id=$1 AND user_id=$2",
        [
          actor.tenantId,
          userId,
          input.username?.toLowerCase() ?? row.login,
          active,
          encoded ?? null,
          input.email?.toLowerCase() ?? null,
        ],
      );
      await this.audit(
        client,
        manager,
        "Usuário atualizado",
        `Conta ${input.username?.toLowerCase() ?? row.login}: ${Object.keys(
          input,
        )
          .map((field) =>
            field === "password" ? "senha temporária redefinida" : field,
          )
          .join(", ")}.`,
      );
      return {
        ...payload,
        permissions: payload.permissions ?? [],
        username: input.username?.toLowerCase() ?? row.login,
        email: input.email?.toLowerCase() ?? row.email ?? undefined,
        active,
        mustChangePassword: encoded !== undefined || row.must_change_password,
      };
    });
  }
}
