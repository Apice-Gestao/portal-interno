import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { createTvFeed, TV_DEFAULT_BLOCKS } from "@apice/domain";
import type {
  Actor,
  CreateTvDevice,
  Department,
  Permission,
  PortalState,
  Task,
  TvDevice,
  UpdateTvDevice,
} from "@apice/domain";
import { PORTAL_STORE } from "../database/portal-store.js";
import type { PortalStore } from "../database/portal-store.js";
import {
  PostgresPortalStore,
  operationalNow,
} from "../database/postgres-store.js";

const SESSION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const PAIR_MILLISECONDS = 10 * 60 * 1000;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
interface DeviceRow {
  tenant_id: string;
  id: string;
  payload: TvDevice;
  pair_hash: string | null;
  pair_expires_at: Date | null;
  token_hash: string | null;
  token_expires_at: Date | null;
}

/** Separate, read-only device identities; never resolves a personal session. */
@Injectable()
export class TVService {
  constructor(@Inject(PORTAL_STORE) private readonly store: PortalStore) {}

  private database() {
    if (!(this.store instanceof PostgresPortalStore))
      throw new ServiceUnavailableException(
        "O painel de TV exige persistência PostgreSQL configurada.",
      );
    return this.store;
  }
  private async transaction<T>(
    write: boolean,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database().pool.connect();
    try {
      await client.query(
        write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL lock_timeout='10s'");
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
  private tenant(client: PoolClient, tenantId: string) {
    return client.query("SELECT set_config('portal.tenant_id',$1,true)", [
      tenantId,
    ]);
  }
  private async actor(
    client: PoolClient,
    supplied: Actor,
    permission: Permission,
  ) {
    await this.tenant(client, supplied.tenantId);
    const result = await client.query<{ payload: Actor; active: boolean }>(
      "SELECT u.payload,c.active FROM portal.users u JOIN portal.credentials c ON c.tenant_id=u.tenant_id AND c.user_id=u.id WHERE u.tenant_id=$1 AND u.id=$2 FOR SHARE OF u,c",
      [supplied.tenantId, supplied.userId],
    );
    const row = result.rows[0];
    if (!row?.active || row.payload.active === false)
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    const actor = row.payload;
    // Never accept legacy role fallbacks or permissions from the request actor.
    if (!actor.permissions?.includes(permission))
      throw new ForbiddenException("Seu acesso não permite esta ação.");
    return actor;
  }
  private departments(actor: Actor, departments: Department[]) {
    if (
      !departments.length ||
      departments.some((department) => !actor.departments.includes(department))
    )
      throw new ForbiddenException("Departamento fora do seu escopo.");
  }
  private teamAccess(actor: Actor) {
    if (!actor.permissions?.includes("tv.team.view"))
      throw new ForbiddenException(
        "Seu acesso não permite exibir o andamento individual da equipe na TV.",
      );
  }
  private defaultBlocks(actor: Actor) {
    return TV_DEFAULT_BLOCKS.filter(
      (block) =>
        block !== "collaborators" ||
        actor.permissions?.includes("tv.team.view"),
    );
  }
  private async device(
    client: PoolClient,
    actor: Actor,
    id: string,
    lock = false,
  ) {
    const result = await client.query<DeviceRow>(
      `SELECT * FROM portal.tv_devices WHERE tenant_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [actor.tenantId, id],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.payload.departments.some(
        (department) => !actor.departments.includes(department),
      )
    )
      throw new NotFoundException("Dispositivo não encontrado neste escopo.");
    return row;
  }
  private audit(
    client: PoolClient,
    actor: Actor,
    action: string,
    device: TvDevice,
  ) {
    const event = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorName: actor.name,
      action,
      detail: `Dispositivo ${device.name}. Versão ${device.version}.`,
      category: "security",
      at: operationalNow(),
    };
    return client.query(
      "INSERT INTO portal.audit(tenant_id,id,payload) VALUES($1,$2,$3)",
      [actor.tenantId, event.id, event],
    );
  }
  async list(actor: Actor) {
    // A share lock is required for persisted grant revalidation, so this is a
    // normal transaction despite being an application-level read operation.
    return this.transaction(true, async (client) => {
      const resolved = await this.actor(client, actor, "tv.view");
      const result = await client.query<{ payload: TvDevice }>(
        "SELECT payload FROM portal.tv_devices WHERE tenant_id=$1 ORDER BY payload->>'name',id",
        [resolved.tenantId],
      );
      return result.rows
        .map((row) => row.payload)
        .filter((device) =>
          device.departments.every((department) =>
            resolved.departments.includes(department),
          ),
        );
    });
  }
  async create(actor: Actor, input: CreateTvDevice) {
    return this.transaction(true, async (client) => {
      const resolved = await this.actor(client, actor, "tv.manage");
      this.departments(resolved, input.departments);
      const at = operationalNow();
      const device: TvDevice = {
        ...input,
        id: randomUUID(),
        tenantId: resolved.tenantId,
        active: true,
        showNames: false,
        blocks: this.defaultBlocks(resolved),
        rotationSeconds: 12,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      await client.query(
        "INSERT INTO portal.tv_devices(tenant_id,id,payload) VALUES($1,$2,$3)",
        [resolved.tenantId, device.id, device],
      );
      await this.audit(client, resolved, "Dispositivo TV cadastrado", device);
      return device;
    });
  }
  async update(actor: Actor, id: string, input: UpdateTvDevice) {
    return this.transaction(true, async (client) => {
      const { expectedVersion, active, ...config } = input;
      const changesConfig = Object.keys(config).length > 0;
      if (!changesConfig && active === undefined)
        throw new BadRequestException("Informe os campos a alterar.");
      const resolved = await this.actor(
        client,
        actor,
        changesConfig ? "tv.configure" : "tv.manage",
      );
      if (active !== undefined && !resolved.permissions?.includes("tv.manage"))
        throw new ForbiddenException(
          "Seu acesso não permite ativar ou revogar dispositivos.",
        );
      const row = await this.device(client, resolved, id, true);
      if (row.payload.version !== expectedVersion)
        throw new ConflictException(
          "O dispositivo mudou. Reabra a configuração atual.",
        );
      if (config.departments) this.departments(resolved, config.departments);
      if (
        (config.blocks ?? row.payload.blocks).includes("collaborators") &&
        (!row.payload.blocks.includes("collaborators") ||
          config.departments?.some(
            (department) => !row.payload.departments.includes(department),
          ))
      )
        this.teamAccess(resolved);
      const updated: TvDevice = {
        ...row.payload,
        ...config,
        ...(active === undefined ? {} : { active }),
        version: row.payload.version + 1,
        updatedAt: operationalNow(),
      };
      // Every activation toggle revokes old pairing and sessions, including a
      // repeated active=false. Reactivation never restores an old credential.
      const revoke = active !== undefined;
      const result = await client.query(
        "UPDATE portal.tv_devices SET payload=$3,pair_hash=CASE WHEN $4 THEN NULL ELSE pair_hash END,pair_expires_at=CASE WHEN $4 THEN NULL ELSE pair_expires_at END,token_hash=CASE WHEN $4 THEN NULL ELSE token_hash END,token_expires_at=CASE WHEN $4 THEN NULL ELSE token_expires_at END,paired_at=CASE WHEN $4 THEN NULL ELSE paired_at END WHERE tenant_id=$1 AND id=$2 AND (payload->>'version')::integer=$5",
        [resolved.tenantId, id, updated, revoke, expectedVersion],
      );
      if (result.rowCount !== 1)
        throw new ConflictException(
          "O dispositivo mudou. Reabra a configuração atual.",
        );
      await this.audit(
        client,
        resolved,
        revoke
          ? "Ativação de dispositivo TV alterada"
          : "Dispositivo TV configurado",
        updated,
      );
      return updated;
    });
  }
  async pairCode(actor: Actor, id: string) {
    return this.transaction(true, async (client) => {
      const resolved = await this.actor(client, actor, "tv.manage");
      const row = await this.device(client, resolved, id, true);
      if (row.payload.blocks.includes("collaborators"))
        this.teamAccess(resolved);
      if (!row.payload.active)
        throw new ConflictException("Ative o dispositivo antes de parear.");
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
      const bytes = randomBytes(10);
      const code = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
      const expiresAt = new Date(Date.now() + PAIR_MILLISECONDS).toISOString();
      const updated = {
        ...row.payload,
        version: row.payload.version + 1,
        updatedAt: operationalNow(),
      };
      await client.query(
        "UPDATE portal.tv_devices SET payload=$3,pair_hash=$4,pair_expires_at=$5,token_hash=NULL,token_expires_at=NULL,paired_at=NULL WHERE tenant_id=$1 AND id=$2",
        [resolved.tenantId, id, updated, sha(code), expiresAt],
      );
      await this.audit(client, resolved, "Novo pareamento TV emitido", updated);
      return { code, expiresAt };
    });
  }
  async pair(code: string) {
    return this.transaction(true, async (client) => {
      const hash = sha(code);
      await client.query("SELECT set_config('portal.tv_pair_hash',$1,true)", [
        hash,
      ]);
      const found = await client.query<DeviceRow>(
        "SELECT * FROM portal.tv_devices WHERE pair_hash=$1",
        [hash],
      );
      const tenantId = found.rows[0]?.tenant_id;
      if (!tenantId)
        throw new UnauthorizedException("Código inválido ou expirado.");
      await this.tenant(client, tenantId);
      // Resolve first, then lock under tenant-only UPDATE RLS. A second lookup
      // rejects a code concurrently consumed/replaced after initial resolution.
      const locked = await client.query<DeviceRow>(
        "SELECT * FROM portal.tv_devices WHERE tenant_id=$1 AND pair_hash=$2 FOR UPDATE",
        [tenantId, hash],
      );
      const row = locked.rows[0];
      if (
        !row?.payload.active ||
        !row.pair_expires_at ||
        row.pair_expires_at.getTime() <= Date.now()
      )
        throw new UnauthorizedException("Código inválido ou expirado.");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + SESSION_MILLISECONDS);
      await client.query(
        "UPDATE portal.tv_devices SET pair_hash=NULL,pair_expires_at=NULL,token_hash=$3,token_expires_at=$4,paired_at=now() WHERE tenant_id=$1 AND id=$2",
        [tenantId, row.id, sha(token), expiresAt],
      );
      return { token, expiresAt };
    });
  }
  private async token(client: PoolClient, token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new UnauthorizedException("TV não pareada ou acesso expirado.");
    const hash = sha(token);
    await client.query("SELECT set_config('portal.tv_token_hash',$1,true)", [
      hash,
    ]);
    const found = await client.query<DeviceRow>(
      "SELECT * FROM portal.tv_devices WHERE token_hash=$1",
      [hash],
    );
    const row = found.rows[0];
    if (
      !row?.payload.active ||
      !row.token_expires_at ||
      row.token_expires_at.getTime() <= Date.now()
    )
      throw new UnauthorizedException("TV não pareada ou acesso expirado.");
    await this.tenant(client, row.tenant_id);
    return row;
  }
  private async feed(client: PoolClient, device: TvDevice) {
    const state: PortalState = {
      tasks: [],
      companies: [],
      templates: [],
      users: [],
      audit: [],
    };
    const tasks = await client.query<{ payload: Task }>(
      "SELECT payload FROM portal.tasks WHERE tenant_id=$1 AND competence=$2 AND department=ANY($3::text[])",
      [device.tenantId, device.competence, device.departments],
    );
    state.tasks = tasks.rows.map((row) => ({ ...row.payload, documents: [] }));
    const companies = await client.query<{
      payload: PortalState["companies"][number];
    }>("SELECT payload FROM portal.companies WHERE tenant_id=$1", [
      device.tenantId,
    ]);
    state.companies = companies.rows.map((row) => row.payload);
    const templates = await client.query<{
      payload: PortalState["templates"][number];
    }>(
      "SELECT payload FROM portal.templates WHERE tenant_id=$1 AND department=ANY($2::text[])",
      [device.tenantId, device.departments],
    );
    state.templates = templates.rows.map((row) => row.payload);
    const users = await client.query<{ payload: Actor }>(
      `SELECT jsonb_build_object(
        'userId',u.id,'tenantId',u.tenant_id,'name',u.payload->>'name',
        'initials',u.payload->>'initials','role',u.payload->>'role',
        'departments',u.payload->'departments','active',true
      ) AS payload
      FROM portal.users u JOIN portal.credentials c
        ON c.tenant_id=u.tenant_id AND c.user_id=u.id
      WHERE u.tenant_id=$1 AND c.active=true
        AND COALESCE((u.payload->>'active')::boolean,true)=true
        AND u.payload->'departments' ?| $2::text[]`,
      [device.tenantId, device.departments],
    );
    state.users = users.rows.map((row) => row.payload);
    return createTvFeed(state, device, operationalNow());
  }
  async watch(token: string) {
    return this.transaction(false, async (client) => {
      const row = await this.token(client, token);
      return this.feed(client, row.payload);
    });
  }
  async preview(actor: Actor, competence: string, department?: Department) {
    return this.transaction(true, async (client) => {
      const resolved = await this.actor(client, actor, "tv.view");
      const departments = department ? [department] : resolved.departments;
      this.departments(resolved, departments);
      const at = operationalNow();
      const device: TvDevice = {
        id: randomUUID(),
        tenantId: resolved.tenantId,
        name: "Prévia do painel",
        departments,
        competence,
        active: true,
        showNames: false,
        blocks: this.defaultBlocks(resolved),
        rotationSeconds: 12,
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      return this.feed(client, device);
    });
  }
  async disconnect(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return;
    await this.transaction(true, async (client) => {
      const hash = sha(token);
      await client.query("SELECT set_config('portal.tv_token_hash',$1,true)", [
        hash,
      ]);
      const found = await client.query<DeviceRow>(
        "SELECT * FROM portal.tv_devices WHERE token_hash=$1",
        [hash],
      );
      const row = found.rows[0];
      if (!row) return;
      await this.tenant(client, row.tenant_id);
      await client.query(
        "UPDATE portal.tv_devices SET token_hash=NULL,token_expires_at=NULL,paired_at=NULL WHERE tenant_id=$1 AND id=$2 AND token_hash=$3",
        [row.tenant_id, row.id, hash],
      );
    });
  }
}
