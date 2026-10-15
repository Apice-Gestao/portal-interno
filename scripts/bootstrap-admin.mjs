import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PERMISSIONS } from "@apice/domain";
import { hashPassword } from "../apps/api/dist/security/password.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const username = process.env.PORTAL_BOOTSTRAP_USERNAME?.trim().toLowerCase();
const password = process.env.PORTAL_BOOTSTRAP_PASSWORD;
const tenantId = process.env.PORTAL_TENANT_ID ?? "apice-demo";
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error(
    "MIGRATION_DATABASE_URL necessária para criar o administrador inicial.",
  );
if (
  !username ||
  !/^[a-z0-9][a-z0-9._@-]{2,79}$/.test(username) ||
  !password ||
  password.length > 128
)
  throw new Error(
    "Configure PORTAL_BOOTSTRAP_USERNAME e PORTAL_BOOTSTRAP_PASSWORD localmente. Nenhum segredo é fixado no código.",
  );
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
    tenantId,
  ]);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    tenantId,
  ]);
  const existing = await client.query(
    "SELECT 1 FROM portal.credentials WHERE tenant_id=$1 AND login=$2",
    [tenantId, username],
  );
  if (existing.rowCount) {
    await client.query("COMMIT");
    console.log("Conta inicial já cadastrada; senha e permissões preservadas.");
  } else {
    const managers = await client.query(
      "SELECT 1 FROM portal.credentials c JOIN portal.users u ON u.tenant_id=c.tenant_id AND u.id=c.user_id WHERE c.tenant_id=$1 AND c.active AND u.payload->'permissions' ? 'users.manage' LIMIT 1",
      [tenantId],
    );
    if (managers.rowCount)
      throw new Error(
        "Já existe administrador ativo. Novas contas devem ser criadas pela gestão de usuários.",
      );
    const encoded = await hashPassword(password);
    const userId = randomUUID();
    await client.query(
      "INSERT INTO portal.tenants(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [tenantId, "Ápice"],
    );
    await client.query(
      "INSERT INTO portal.users(tenant_id,id,payload) VALUES($1,$2,$3)",
      [
        tenantId,
        userId,
        {
          userId,
          tenantId,
          name: "Administrador",
          initials: "AD",
          role: "admin",
          departments: ["Fiscal", "Contábil", "Pessoal"],
          permissions: [...PERMISSIONS],
          active: true,
        },
      ],
    );
    await client.query(
      "INSERT INTO portal.credentials(tenant_id,user_id,login,password_hash,email,active,must_change_password) VALUES($1,$2,$3,$4,$5,true,true)",
      [
        tenantId,
        userId,
        username,
        encoded,
        process.env.PORTAL_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? null,
      ],
    );
    const id = randomUUID();
    await client.query(
      "INSERT INTO portal.audit(tenant_id,id,payload) VALUES($1,$2,$3)",
      [
        tenantId,
        id,
        {
          id,
          tenantId,
          actorId: userId,
          actorName: "Administrador",
          action: "Administrador inicial criado",
          detail:
            "Conta inicial criada por configuração local; troca de senha obrigatória.",
          at: new Date().toISOString(),
          category: "security",
        },
      ],
    );
    await client.query("COMMIT");
    console.log(
      "Administrador inicial criado; a troca da senha temporária será obrigatória no primeiro acesso.",
    );
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
