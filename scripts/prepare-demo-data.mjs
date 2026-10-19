import { existsSync } from "node:fs";
import pg from "pg";
import { applyDemoShowcase, users } from "@apice/domain";
import { PostgresPortalStore } from "../apps/api/dist/database/postgres-store.js";
import {
  LOCAL_TEST_GROUPS,
  localTestLoginEnabled,
} from "../apps/api/dist/security/local-test-login.js";

// TEMPORARY (17/10/2026): fictitious demonstration records for the three local
// test groups, so every screen (Central do gestor, fluxos, implantações,
// comentários, etapas por empresa) has something to show. Remove together with
// prepare-local-test.mjs before the VPS release. Each block only runs when its
// area is still empty, so running it again never duplicates or overwrites data.
if (existsSync(".env")) process.loadEnvFile(".env");
if (!localTestLoginEnabled())
  throw new Error("Dados de demonstração exigem o acesso local de testes.");
const owner = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(owner.hostname) ||
  owner.port !== "55432"
)
  throw new Error(
    "Dados de demonstração exigem a instância PostgreSQL local exclusiva.",
  );

const helena = users.find((user) => user.userId === "helena");
const pool = new pg.Pool({ connectionString: owner.href, max: 1 });
const store = new PostgresPortalStore(pool);
try {
  for (const [group, tenantId] of Object.entries(LOCAL_TEST_GROUPS)) {
    const actor = { ...structuredClone(helena), tenantId };
    const done = await store.run(actor, (engine, resolved) =>
      applyDemoShowcase(engine, resolved),
    );
    for (const line of done) console.log(`  ${group}: ${line}`);
  }
  console.log(
    "Dados de demonstração conferidos; registros existentes preservados.",
  );
} finally {
  await pool.end();
}
