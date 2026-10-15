import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createSeed, OPERATOR_PERMISSIONS, PERMISSIONS } from "@apice/domain";
import { seedDatabase } from "../apps/api/dist/database/postgres-store.js";
import { hashPassword } from "../apps/api/dist/security/password.js";
import {
  LOCAL_TEST_TENANT,
  localTestLoginEnabled,
} from "../apps/api/dist/security/local-test-login.js";

// TEMPORARY: remove with local-test-login.ts before the VPS release.
if (existsSync(".env")) process.loadEnvFile(".env");
if (!localTestLoginEnabled())
  throw new Error(
    "Preparação de testes exige acesso local explicitamente habilitado.",
  );
const owner = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(owner.hostname) ||
  owner.port !== "55432"
)
  throw new Error(
    "Dados de teste exigem a instância PostgreSQL local exclusiva.",
  );
const state = createSeed();
for (const records of Object.values(state))
  for (const record of records) record.tenantId = LOCAL_TEST_TENANT;
for (const actor of state.users) {
  actor.active = true;
  actor.permissions =
    actor.role === "admin"
      ? [...PERMISSIONS]
      : actor.role === "operator"
        ? [...OPERATOR_PERMISSIONS]
        : actor.role === "coordinator"
          ? [
              "overview.view",
              "tasks.view",
              "tasks.team.view",
              "tasks.review",
              "tasks.manage",
              "tasks.download",
              "companies.view",
              "documents.view",
              "reports.view",
            ]
          : ["tasks.view", "tasks.team.view", "tasks.download"];
}
const encoded = await hashPassword(randomBytes(48).toString("base64url"));
const pool = new pg.Pool({ connectionString: owner.href, max: 1 });
try {
  await seedDatabase(pool, state, new Map(), {
    tenantNames: new Map([[LOCAL_TEST_TENANT, "Ápice · testes locais"]]),
    credentials: state.users.map((actor) => ({
      tenant_id: LOCAL_TEST_TENANT,
      user_id: actor.userId,
      login: `local-test-${actor.userId}`,
      email: null,
      email_verified: false,
      password_hash: encoded,
      active: true,
      must_change_password: false,
      password_version: "1",
      updated_at: new Date().toISOString(),
    })),
  });
  console.log(
    "Ambiente fictício de testes preparado; dados existentes preservados.",
  );
} finally {
  await pool.end();
}
