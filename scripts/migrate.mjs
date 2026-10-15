import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
const env = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(env)) process.loadEnvFile(env);
if (!process.env.MIGRATION_DATABASE_URL || !process.env.DATABASE_URL)
  throw new Error(
    "Configure as conexões de migração e execução, sem incluí-las no Git.",
  );
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
try {
  await migrateDatabase(
    pool,
    decodeURIComponent(new URL(process.env.DATABASE_URL).username),
  );
  console.log("Migrações aplicadas e permissões de execução configuradas.");
} finally {
  await pool.end();
}
