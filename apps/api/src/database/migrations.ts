import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
export async function migrateDatabase(pool: Pool, runtimeRole: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(runtimeRole))
    throw new Error("Nome inválido para o usuário de execução do banco.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(86081001)");
    await client.query("CREATE SCHEMA IF NOT EXISTS portal_meta");
    await client.query("REVOKE ALL ON SCHEMA portal_meta FROM PUBLIC");
    await client.query(
      "CREATE TABLE IF NOT EXISTS portal_meta.migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = fileURLToPath(
      new URL("../../../../supabase/migrations/", import.meta.url),
    );
    for (const name of (await readdir(directory))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(`${directory}/${name}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM portal_meta.migrations WHERE name=$1",
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0]!.checksum !== checksum)
          throw new Error(`Migração já aplicada foi modificada: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO portal_meta.migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
    }
    await client.query(`GRANT USAGE ON SCHEMA portal TO "${runtimeRole}"`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE ON portal.users,portal.companies,portal.templates,portal.tasks TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT SELECT, INSERT ON portal.documents,portal.audit TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT SELECT,INSERT,UPDATE ON portal.credentials TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT SELECT,INSERT,UPDATE ON portal.password_reset_tokens,portal.email_mfa_challenges TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT SELECT,INSERT,UPDATE ON portal.tv_devices TO "${runtimeRole}"`,
    );
    await client.query(`GRANT SELECT,INSERT,UPDATE ON portal.workspace_settings,portal.company_change_proposals TO "${runtimeRole}"`);
    await client.query(
      `GRANT SELECT,INSERT,UPDATE ON portal.department_flows,portal.company_onboardings TO "${runtimeRole}"`,
    );
    // Automatic generation lists the groups; only their IDs, never names.
    await client.query(
      `GRANT SELECT (id) ON portal.tenants TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT USAGE ON ALL SEQUENCES IN SCHEMA portal TO "${runtimeRole}"`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
