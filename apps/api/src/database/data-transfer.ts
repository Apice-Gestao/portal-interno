import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { PortalState } from "@apice/domain";
import { tvDeviceSchema } from "@apice/domain";
import type { TvDevice } from "@apice/domain";
import { loadState, seedDatabase } from "./postgres-store.js";
export interface DataBundle {
  format: "portal-data-v2";
  exportedAt: string;
  tenants: { id: string; name: string }[];
  state: PortalState;
  documents: { tenantId: string; id: string; content: string }[];
  credentials: {
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
  tvDevices?: TvDevice[];
}
export async function exportData(pool: Pool): Promise<DataBundle> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tenants = await client.query<{ id: string; name: string }>(
      "SELECT id,name FROM portal.tenants ORDER BY id",
    );
    const state: PortalState = {
      users: [],
      companies: [],
      templates: [],
      tasks: [],
      audit: [],
    };
    for (const tenant of tenants.rows) {
      const part = await loadState(client, tenant.id);
      for (const key of [
        "users",
        "companies",
        "templates",
        "tasks",
        "audit",
      ] as const)
        Object.assign(state, { [key]: [...state[key], ...part[key]] });
    }
    const files = await client.query<{
      tenant_id: string;
      id: string;
      content: Buffer;
    }>(
      "SELECT tenant_id,id,content FROM portal.documents ORDER BY tenant_id,id",
    );
    const credentials = await client.query<DataBundle["credentials"][number]>(
      "SELECT tenant_id,user_id,login,email,email_verified,password_hash,active,must_change_password,password_version,updated_at::text FROM portal.credentials ORDER BY tenant_id,user_id",
    );
    const tvDevices = await client.query<{ payload: TvDevice }>(
      "SELECT payload FROM portal.tv_devices ORDER BY tenant_id,id",
    );
    await client.query("COMMIT");
    return {
      format: "portal-data-v2",
      exportedAt: new Date().toISOString(),
      tenants: tenants.rows,
      credentials: credentials.rows,
      tvDevices: tvDevices.rows.map((row) => row.payload),
      state,
      documents: files.rows.map((r) => ({
        tenantId: r.tenant_id,
        id: r.id,
        content: r.content.toString("base64"),
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function importData(pool: Pool, bundle: DataBundle) {
  if (
    bundle.format !== "portal-data-v2" ||
    !Array.isArray(bundle.credentials) ||
    !Array.isArray(bundle.tenants) ||
    !Array.isArray(bundle.documents) ||
    !bundle.state ||
    !["users", "companies", "templates", "tasks", "audit"].every((key) =>
      Array.isArray(bundle.state[key as keyof PortalState]),
    )
  )
    throw new Error("Formato do arquivo de migração inválido.");
  const tenantIds = bundle.tenants.map((t) => t.id);
  if (
    !tenantIds.length ||
    tenantIds.some((id) => typeof id !== "string" || !id.length)
  )
    throw new Error("Arquivo de migração não contém tenants válidos.");
  if (
    new Set(tenantIds).size !== tenantIds.length ||
    bundle.tenants.some((t) => typeof t.name !== "string" || !t.name.trim())
  )
    throw new Error("Metadados de tenant inválidos ou duplicados.");
  for (const key of [
    "users",
    "companies",
    "templates",
    "tasks",
    "audit",
  ] as const)
    if (bundle.state[key].some((row) => !tenantIds.includes(row.tenantId)))
      throw new Error(
        "Registro pertence a tenant sem usuários no arquivo de migração.",
      );
  const byTenant = new Map<string, Buffer>();
  const devices: TvDevice[] = [];
  if (bundle.tvDevices !== undefined) {
    if (!Array.isArray(bundle.tvDevices))
      throw new Error("Configuração de TV inválida no arquivo de migração.");
    const uniqueDevices = new Set<string>();
    for (const value of bundle.tvDevices) {
      const parsed = tvDeviceSchema.safeParse(value);
      if (!parsed.success || !tenantIds.includes(parsed.data.tenantId))
        throw new Error(
          "Dispositivo de TV inválido ou fora dos tenants exportados.",
        );
      const device = parsed.data;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          device.id,
        )
      )
        throw new Error("Identificador de dispositivo de TV inválido.");
      const key = `${device.tenantId}\0${device.id}`;
      if (uniqueDevices.has(key))
        throw new Error("Dispositivo de TV duplicado no arquivo de migração.");
      uniqueDevices.add(key);
      devices.push(device);
    }
  }
  const accounts = new Set<string>();
  for (const credential of bundle.credentials) {
    const key = `${credential.tenant_id}\0${credential.user_id}`;
    if (
      accounts.has(key) ||
      !bundle.state.users.some(
        (u) =>
          u.tenantId === credential.tenant_id &&
          u.userId === credential.user_id,
      )
    )
      throw new Error("Identidade duplicada ou sem usuário.");
    accounts.add(key);
  }
  for (const doc of bundle.documents) {
    if (
      typeof doc.tenantId !== "string" ||
      typeof doc.id !== "string" ||
      typeof doc.content !== "string"
    )
      throw new Error("Formato da evidência inválido.");
    const key = `${doc.tenantId}\0${doc.id}`;
    const bytes = Buffer.from(doc.content, "base64");
    if (byTenant.has(key) || bytes.toString("base64") !== doc.content)
      throw new Error("Evidência duplicada ou codificação inválida.");
    byTenant.set(key, bytes);
  }
  const referenced = new Set<string>();
  for (const task of bundle.state.tasks)
    for (const doc of task.documents) {
      const key = `${task.tenantId}\0${doc.id}`;
      const bytes = byTenant.get(key);
      if (
        !bytes ||
        bytes.length !== doc.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== doc.hash
      )
        throw new Error(
          "Arquivo de migração contém evidência ausente ou com hash inválido.",
        );
      if (referenced.has(key))
        throw new Error("Evidência vinculada a mais de uma tarefa.");
      referenced.add(key);
    }
  if (referenced.size !== byTenant.size)
    throw new Error("Arquivo de migração contém evidências sem tarefa.");
  // Seed accepts the content map per tenant, so repeated IDs across tenants stay separate.
  await seedDatabase(pool, bundle.state, byTenant, {
    rejectExisting: true,
    requireContents: true,
    tenantNames: new Map(bundle.tenants.map((t) => [t.id, t.name])),
    credentials: bundle.credentials,
  });
  // Device configuration is portable; pairing secrets and credentials are not.
  // Restored televisions must pair again at the destination.
  if (devices.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const device of devices) {
        await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
          device.tenantId,
        ]);
        await client.query(
          "INSERT INTO portal.tv_devices(tenant_id,id,payload) VALUES($1,$2,$3)",
          [device.tenantId, device.id, device],
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
}
