import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import {
  demoPdf,
  DomainError,
  MemoryRepository,
  PortalEngine,
  SYSTEM_ACTOR_ID,
} from "@apice/domain";
import type {
  Actor,
  AuditEvent,
  DocumentVersion,
  PortalState,
  ReportFilters,
  Task,
} from "@apice/domain";
import type { PortalStore, SecurityContext } from "./portal-store.js";
const tableNames = {
  users: "users",
  companies: "companies",
  templates: "templates",
  tasks: "tasks",
  audit: "audit",
  departmentFlows: "department_flows",
  companyOnboardings: "company_onboardings",
  workspaces: "workspace_settings",
  changeProposals: "company_change_proposals",
} as const;
const tables = Object.keys(tableNames) as (keyof typeof tableNames)[];
const idOf = (row: { id: string } | Actor) =>
  "userId" in row ? row.userId : row.id;
const withoutDocuments = (task: Task) => {
  const payload: Omit<Task, "documents"> & { documents?: unknown } = {
    ...task,
  };
  delete payload.documents;
  return payload;
};
export async function loadState(
  client: PoolClient,
  tenantId: string,
): Promise<PortalState> {
  const state: PortalState = {
    users: [],
    companies: [],
    templates: [],
    tasks: [],
    audit: [],
    departmentFlows: [],
    companyOnboardings: [],
    workspaces: [],
    changeProposals: [],
  };
  for (const table of tables) {
    const result = await client.query<{ payload: unknown }>(
      `SELECT payload FROM portal.${tableNames[table]} WHERE tenant_id=$1${table === "audit" ? " ORDER BY sequence DESC" : ""}`,
      [tenantId],
    );
    Object.assign(state, { [table]: result.rows.map((r) => r.payload) });
  }
  const docs = await client.query<{
    task_id: string;
    payload: DocumentVersion;
  }>(
    "SELECT task_id,payload FROM portal.documents WHERE tenant_id=$1 ORDER BY version",
    [tenantId],
  );
  const byTask = new Map<string, DocumentVersion[]>();
  for (const row of docs.rows) {
    const values = byTask.get(row.task_id) ?? [];
    values.push(row.payload);
    byTask.set(row.task_id, values);
  }
  state.tasks = state.tasks.map((task) => ({
    ...task,
    documents: byTask.get(task.id) ?? [],
  }));
  return state;
}
async function insertRecords(
  client: PoolClient,
  table: (typeof tables)[number],
  tenantId: string,
  rows: unknown[],
) {
  if (!rows.length) return;
  const values = rows.map((row) => ({
    id: idOf(row as Actor | { id: string }),
    payload: row,
  }));
  await client.query(
    `INSERT INTO portal.${tableNames[table]}(tenant_id,id,payload) SELECT $1,r.id,r.payload FROM jsonb_to_recordset($2::jsonb) AS r(id text,payload jsonb)`,
    [tenantId, JSON.stringify(values)],
  );
}
async function persist(
  client: PoolClient,
  tenantId: string,
  before: PortalState,
  after: PortalState,
  content?: Buffer,
) {
  for (const table of ["users", "companies"] as const) {
    const previous = new Map(
      before[table].map((r) => [idOf(r), JSON.stringify(r)]),
    );
    const additions = after[table].filter((r) => !previous.has(idOf(r)));
    const modified = after[table].filter(
      (r) =>
        previous.has(idOf(r)) && previous.get(idOf(r)) !== JSON.stringify(r),
    );
    if (modified.length && table === "users")
      throw new Error(
        "Alteração de cadastro ainda não suportada por este caso de uso.",
      );
    await insertRecords(client, table, tenantId, additions);
    if (table === "companies")
      for (const row of modified) {
        const previousCompany = before.companies.find(
          (company) => company.id === idOf(row),
        )!;
        const result = await client.query(
          "UPDATE portal.companies SET payload=$3 WHERE tenant_id=$1 AND id=$2 AND COALESCE((payload->>'revision')::integer,1)=$4 RETURNING id",
          [tenantId, idOf(row), row, previousCompany.revision ?? 1],
        );
        if (result.rowCount !== 1)
          throw new DomainError(
            "CONFLICT",
            "O cadastro da empresa mudou.",
            409,
          );
      }
  }
  for (const table of [
    "departmentFlows",
    "companyOnboardings",
    "workspaces",
    "changeProposals",
  ] as const) {
    const old = new Map(
      (before[table] ?? []).map((record) => [record.id, record]),
    );
    await insertRecords(
      client,
      table,
      tenantId,
      (after[table] ?? []).filter((record) => !old.has(record.id)),
    );
    const updates = (after[table] ?? [])
      .filter(
        (record) =>
          old.has(record.id) &&
          JSON.stringify(old.get(record.id)) !== JSON.stringify(record),
      )
      .map((record) => ({
        id: record.id,
        version:
          table === "departmentFlows"
            ? (old.get(record.id) as { version: number }).version
            : (old.get(record.id) as { revision: number }).revision,
        payload: record,
      }));
    if (updates.length) {
      const versionField = table === "departmentFlows" ? "version" : "revision";
      const result = await client.query(
        `UPDATE portal.${tableNames[table]} t SET payload=r.payload FROM jsonb_to_recordset($2::jsonb) AS r(id text,version integer,payload jsonb) WHERE t.tenant_id=$1 AND t.id=r.id AND (t.payload->>'${versionField}')::integer=r.version RETURNING t.id`,
        [tenantId, JSON.stringify(updates)],
      );
      if (result.rowCount !== updates.length)
        throw new DomainError(
          "CONFLICT",
          "O fluxo ou a implantação mudou. Atualize a lista.",
          409,
        );
    }
  }
  const oldTemplates = new Map(
    before.templates.map((model) => [model.id, model]),
  );
  await insertRecords(
    client,
    "templates",
    tenantId,
    after.templates.filter((model) => !oldTemplates.has(model.id)),
  );
  const templateUpdates = after.templates
    .filter(
      (model) =>
        oldTemplates.has(model.id) &&
        JSON.stringify(oldTemplates.get(model.id)) !== JSON.stringify(model),
    )
    .map((model) => ({
      id: model.id,
      version: oldTemplates.get(model.id)!.version,
      payload: model,
    }));
  if (templateUpdates.length) {
    const result = await client.query(
      "UPDATE portal.templates t SET payload=r.payload FROM jsonb_to_recordset($2::jsonb) AS r(id text,version integer,payload jsonb) WHERE t.tenant_id=$1 AND t.id=r.id AND (t.payload->>'version')::integer=r.version RETURNING t.id",
      [tenantId, JSON.stringify(templateUpdates)],
    );
    if (result.rowCount !== templateUpdates.length)
      throw new DomainError(
        "CONFLICT",
        "O modelo mudou durante a operação. Reabra a versão atual.",
        409,
      );
  }
  const oldTasks = new Map(before.tasks.map((t) => [t.id, t]));
  await insertRecords(
    client,
    "tasks",
    tenantId,
    after.tasks.filter((t) => !oldTasks.has(t.id)).map(withoutDocuments),
  );
  const updates = after.tasks
    .filter(
      (t) =>
        oldTasks.has(t.id) &&
        JSON.stringify(oldTasks.get(t.id)) !== JSON.stringify(t),
    )
    .map((t) => ({
      id: t.id,
      revision: oldTasks.get(t.id)!.revision,
      payload: withoutDocuments(t),
    }));
  if (updates.length) {
    const result = await client.query(
      "UPDATE portal.tasks t SET payload=r.payload FROM jsonb_to_recordset($2::jsonb) AS r(id text,revision integer,payload jsonb) WHERE t.tenant_id=$1 AND t.id=r.id AND t.revision=r.revision RETURNING t.id",
      [tenantId, JSON.stringify(updates)],
    );
    if (result.rowCount !== updates.length)
      throw new DomainError(
        "CONFLICT",
        "A tarefa mudou durante a operação. Atualize a lista.",
        409,
      );
  }
  const oldDocs = new Set(
    before.tasks.flatMap((t) => t.documents.map((d) => d.id)),
  );
  const additions = after.tasks.flatMap((t) =>
    t.documents
      .filter((d) => !oldDocs.has(d.id))
      .map((doc) => ({ taskId: t.id, doc })),
  );
  if (additions.length) {
    if (additions.length !== 1 || !content)
      throw new Error(
        "Upload deve persistir exatamente uma evidência com conteúdo.",
      );
    const { taskId, doc } = additions[0]!;
    await client.query(
      "INSERT INTO portal.documents(tenant_id,id,task_id,payload,content) VALUES($1,$2,$3,$4,$5)",
      [tenantId, doc.id, taskId, doc, content],
    );
  }
  const oldAudit = new Set(before.audit.map((e) => e.id));
  // Insert chronological order, then queries use descending sequence.
  await insertRecords(
    client,
    "audit",
    tenantId,
    after.audit.filter((e) => !oldAudit.has(e.id)).reverse(),
  );
}
export function operationalNow(
  timeZone = process.env.PORTAL_TIMEZONE ?? "America/Sao_Paulo",
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}
export class PostgresPortalStore implements PortalStore {
  readonly mode = "postgres" as const;
  constructor(
    readonly pool: Pool,
    private readonly clock: () => string = () => operationalNow(),
  ) {
    pool.on("error", () => {
      console.warn(
        "Conexão PostgreSQL ociosa interrompida; novas operações tentarão reconectar.",
      );
    });
  }
  private async transaction<T>(
    actor: Actor,
    operation: (
      client: PoolClient,
      engine: PortalEngine,
      resolved: Actor,
      before: PortalState,
      repository: MemoryRepository,
    ) => Promise<T>,
    write: boolean,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(
        write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
        actor.tenantId,
      ]);
      if (write)
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [actor.tenantId],
        );
      const before = await loadState(client, actor.tenantId);
      // Scheduled server work runs as the system identity, never as a session user.
      const resolved =
        actor.userId === SYSTEM_ACTOR_ID
          ? structuredClone(actor)
          : before.users.find((u) => u.userId === actor.userId);
      if (!resolved || resolved.active === false)
        throw new DomainError(
          "UNAUTHENTICATED",
          "Identidade não pertence a este escritório.",
          401,
        );
      if (actor.permissions !== undefined) resolved.permissions ??= [];
      const repository = new MemoryRepository(before);
      const engine = new PortalEngine(repository, this.clock, randomUUID);
      const result = await operation(
        client,
        engine,
        resolved,
        before,
        repository,
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async snapshot(actor: Actor) {
    const snapshot = await this.transaction(
      actor,
      async (_client, engine, resolved) => engine.snapshot(resolved),
      false,
    );
    return { ...snapshot, persistence: "postgres" as const };
  }
  async report(actor: Actor, filters: ReportFilters) {
    return this.transaction(
      actor,
      async (_client, engine, resolved) => engine.report(resolved, filters),
      false,
    );
  }
  /** Groups to run scheduled work for; falls back to the configured group. */
  async tenantIds(): Promise<string[]> {
    try {
      const result = await this.pool.query<{ id: string }>(
        "SELECT id FROM portal.tenants ORDER BY id",
      );
      if (result.rows.length) return result.rows.map((row) => row.id);
    } catch {
      console.warn(
        "Geração automática: lista de grupos indisponível; usando PORTAL_TENANT_ID.",
      );
    }
    return [process.env.PORTAL_TENANT_ID ?? "apice-demo"];
  }
  async ping() {
    const probe = { text: "SELECT 1", query_timeout: 5000 };
    await this.pool.query(probe);
  }
  async run<T>(
    actor: Actor,
    operation: (engine: PortalEngine, resolved: Actor) => T,
    content?: Buffer,
  ): Promise<T> {
    return this.transaction(
      actor,
      async (client, engine, resolved, before, repository) => {
        if (content) {
          const size = await client.query<{ bytes: string }>(
            "SELECT coalesce(sum(octet_length(content)),0)::text AS bytes FROM portal.documents WHERE tenant_id=$1",
            [actor.tenantId],
          );
          const cap = Number(
            process.env.MAX_TENANT_DOCUMENT_BYTES ?? 1024 * 1024 * 1024,
          );
          if (!Number.isSafeInteger(cap) || cap < 1)
            throw new Error("Limite documental inválido.");
          if (Number(size.rows[0]!.bytes) + content.length > cap)
            throw new DomainError(
              "STORAGE_LIMIT",
              "Limite documental do escritório atingido.",
              413,
            );
        }
        const result = operation(engine, resolved);
        await persist(
          client,
          actor.tenantId,
          before,
          repository.read(),
          content,
        );
        return result;
      },
      true,
    );
  }
  async download(
    actor: Actor,
    taskId: string,
    documentId: string,
    context?: SecurityContext,
  ) {
    return this.transaction(
      actor,
      async (client, engine, resolved, before, repository) => {
        const task = engine
          .snapshot(resolved)
          .tasks.find((t) => t.id === taskId);
        const doc = task?.documents.find((d) => d.id === documentId);
        if (!doc)
          throw new DomainError(
            "NOT_FOUND",
            "Documento não encontrado neste escopo.",
            404,
          );
        const result = await client.query<{ content: Buffer }>(
          "SELECT content FROM portal.documents WHERE tenant_id=$1 AND id=$2 AND task_id=$3",
          [actor.tenantId, documentId, taskId],
        );
        const bytes = result.rows[0]?.content;
        if (!bytes)
          throw new DomainError(
            "MISSING_CONTENT",
            "Conteúdo do documento indisponível.",
            503,
          );
        if (createHash("sha256").update(bytes).digest("hex") !== doc.hash)
          throw new DomainError(
            "INTEGRITY_ERROR",
            "Falha de integridade do documento.",
            500,
          );
        engine.logSecurity(resolved, "Documento baixado", doc.name, {
          ...context,
          taskId,
        });
        await persist(client, actor.tenantId, before, repository.read());
        return { doc, bytes };
      },
      true,
    );
  }
  async security(
    actor: Actor,
    action: string,
    detail: string,
    context?: SecurityContext,
  ) {
    await this.run(actor, (engine, resolved) =>
      engine.logSecurity(resolved, action, detail, context),
    );
  }
  async close() {
    await this.pool.end();
  }
  static async connect(connectionString: string) {
    const pool = new pg.Pool({
      connectionString,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });
    const store = new PostgresPortalStore(pool);
    try {
      const result = await pool.query<{
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      if (result.rows[0]?.rolsuper || result.rows[0]?.rolbypassrls)
        throw new Error("A API não pode usar usuário superuser ou BYPASSRLS.");
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }
}
export async function seedDatabase(
  pool: Pool,
  state: PortalState,
  contents = new Map<string, Buffer>(),
  options: {
    rejectExisting?: boolean;
    requireContents?: boolean;
    tenantNames?: ReadonlyMap<string, string>;
    credentials?: {
      tenant_id: string;
      user_id: string;
      login: string;
      email: string | null;
      email_verified: boolean;
      password_hash: string;
      active: boolean;
      must_change_password: boolean;
      password_version: string;
      updated_at: string;
    }[];
  } = {},
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(86081002)");
    for (const tenantId of new Set([
      ...state.users.map((u) => u.tenantId),
      ...(options.tenantNames?.keys() ?? []),
    ])) {
      const exists = await client.query(
        options.rejectExisting
          ? "SELECT 1 FROM portal.tenants WHERE id=$1 LIMIT 1"
          : "SELECT 1 FROM portal.users WHERE tenant_id=$1 LIMIT 1",
        [tenantId],
      );
      if (exists.rowCount) {
        if (options.rejectExisting)
          throw new Error(
            "Destino já contém estes tenants. Importação não sobrescreve dados.",
          );
        continue;
      }
      await client.query(
        "INSERT INTO portal.tenants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [
          tenantId,
          options.tenantNames?.get(tenantId) ??
            (tenantId === "apice-demo" ? "Ápice · demonstração" : tenantId),
        ],
      );
      for (const table of ["users", "companies", "templates"] as const)
        await insertRecords(
          client,
          table,
          tenantId,
          state[table].filter((r) => r.tenantId === tenantId),
        );
      for (const table of [
        "departmentFlows",
        "companyOnboardings",
        "workspaces",
        "changeProposals",
      ] as const)
        await insertRecords(
          client,
          table,
          tenantId,
          (state[table] ?? []).filter((row) => row.tenantId === tenantId),
        );
      const tasks = state.tasks.filter((t) => t.tenantId === tenantId);
      await insertRecords(
        client,
        "tasks",
        tenantId,
        tasks.map(withoutDocuments),
      );
      for (const task of tasks)
        for (const original of task.documents) {
          const supplied =
            contents.get(`${tenantId}\0${original.id}`) ??
            contents.get(original.id);
          if (options.requireContents && !supplied)
            throw new Error("Conteúdo obrigatório da evidência está ausente.");
          const bytes =
            supplied ??
            Buffer.from(
              original.kind === "PDF"
                ? demoPdf()
                : new TextEncoder().encode("<demonstracao/>"),
            );
          const doc = {
            ...original,
            bytes: bytes.length,
            hash: createHash("sha256").update(bytes).digest("hex"),
          };
          await client.query(
            "INSERT INTO portal.documents(tenant_id,id,task_id,payload,content) VALUES($1,$2,$3,$4,$5)",
            [tenantId, doc.id, task.id, doc, bytes],
          );
        }
      await insertRecords(
        client,
        "audit",
        tenantId,
        state.audit
          .filter((e: AuditEvent) => e.tenantId === tenantId)
          .reverse(),
      );
      for (const credential of options.credentials?.filter(
        (c) => c.tenant_id === tenantId,
      ) ?? [])
        await client.query(
          "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,active,must_change_password,password_version,updated_at,email,email_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            credential.tenant_id,
            credential.user_id,
            credential.login,
            credential.password_hash,
            credential.active,
            credential.must_change_password,
            credential.password_version,
            credential.updated_at,
            credential.email,
            credential.email_verified,
          ],
        );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
