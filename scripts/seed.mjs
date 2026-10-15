import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { createSeed } from "../packages/domain/dist/index.js";
import { seedDatabase } from "../apps/api/dist/database/postgres-store.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error("Conexão de migração não configurada.");
const archive = path.join(root, ".local", "memory-archive");
const archivedState = path.join(archive, "state.json");
const state = existsSync(archivedState)
  ? JSON.parse(readFileSync(archivedState, "utf8"))
  : createSeed();
const contents = new Map();
if (existsSync(path.join(archive, "documents")))
  for (const id of readdirSync(path.join(archive, "documents")))
    contents.set(id, readFileSync(path.join(archive, "documents", id)));
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
try {
  await seedDatabase(pool, state, contents);
  console.log(
    "Fixtures/estado anterior preservados; tenants existentes não foram sobrescritos.",
  );
} finally {
  await pool.end();
}
