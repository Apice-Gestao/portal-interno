import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { OPERATOR_PERMISSIONS } from "@apice/domain";
import { LOCAL_TEST_TENANT } from "../apps/api/dist/security/local-test-login.js";

// TEMPORARY verification for the requested local fixture access. Remove before VPS.
if (existsSync(".env")) process.loadEnvFile(".env");
const base = "http://127.0.0.1:3001/api/v1";
let checks = 0;
async function call(path, method = "GET", token, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function login(password) {
  const response = await call("/login", "POST", undefined, {
    username: process.env.LOCAL_TEST_USERNAME,
    password,
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.mode, "local-test");
  assert.equal(result.actor.tenantId, LOCAL_TEST_TENANT);
  assert.equal(result.mustChangePassword, false);
  assert.ok(result.token);
  assert.equal(result.requiresSecondFactor, undefined);
  checks++;
  return result;
}
const owner = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(owner.hostname) && owner.port === "55432",
);
assert.notEqual(
  process.env.PORTAL_TENANT_ID ?? "apice-demo",
  LOCAL_TEST_TENANT,
);
const pool = new pg.Pool({ connectionString: owner.href, max: 1 });
async function mainFingerprint() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('portal.tenant_id',$1,true)", [
      process.env.PORTAL_TENANT_ID ?? "apice-demo",
    ]);
    const values = [];
    for (const table of ["users", "companies", "templates", "tasks", "audit"])
      values.push(
        (
          await client.query(
            `SELECT md5(coalesce(string_agg(payload::text,'' ORDER BY id),'')) AS fingerprint FROM portal.${table} WHERE tenant_id=$1`,
            [process.env.PORTAL_TENANT_ID ?? "apice-demo"],
          )
        ).rows[0].fingerprint,
      );
    await client.query("COMMIT");
    return values;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
const tokens = [];
try {
  const before = await mainFingerprint();
  const admin = await login(process.env.LOCAL_TEST_ADMIN_PASSWORD);
  tokens.push(admin.token);
  assert.equal(admin.actor.role, "admin");
  const adminResponse = await call("/snapshot", "GET", admin.token);
  assert.equal(adminResponse.status, 200);
  const all = await adminResponse.json();
  assert.ok(all.tasks.length > 0);
  assert.ok(all.tasks.every((task) => task.tenantId === LOCAL_TEST_TENANT));
  assert.equal((await call("/users", "GET", admin.token)).status, 200);
  checks += 3;
  for (const id of ["helena", "julia"]) {
    assert.equal(
      (
        await call(`/users/${id}`, "PATCH", admin.token, {
          password: "SyntheticNewPassword123!",
        })
      ).status,
      409,
    );
    checks++;
  }

  const operator = await login(process.env.LOCAL_TEST_OPERATOR_PASSWORD);
  tokens.push(operator.token);
  assert.equal(operator.actor.role, "operator");
  assert.deepEqual(operator.actor.permissions, [...OPERATOR_PERMISSIONS]);
  const ownResponse = await call("/snapshot", "GET", operator.token);
  assert.equal(ownResponse.status, 200);
  const own = await ownResponse.json();
  assert.ok(own.tasks.length > 0);
  assert.ok(
    own.tasks.every(
      (task) =>
        task.assigneeId === operator.actor.userId &&
        task.tenantId === LOCAL_TEST_TENANT,
    ),
  );
  assert.ok(own.tasks.length < all.tasks.length);
  checks += 2;
  for (const [path, method] of [
    ["/users", "GET"],
    ["/users", "POST"],
    ["/tasks", "POST"],
    ["/companies", "POST"],
    ["/generation", "POST"],
  ]) {
    assert.equal(
      (
        await call(
          path,
          method,
          operator.token,
          method === "POST" ? {} : undefined,
        )
      ).status,
      403,
    );
    checks++;
  }
  const foreign = all.tasks.find(
    (task) =>
      task.department === "Fiscal" && task.assigneeId !== operator.actor.userId,
  );
  assert.ok(foreign);
  assert.equal(
    (
      await call(`/tasks/${foreign.id}/actions`, "POST", operator.token, {
        type: "start",
        expectedRevision: foreign.revision,
      })
    ).status,
    404,
  );
  checks++;
  // Exercise only an explicitly verified fictitious task and preserve its audit trail.
  let task = own.tasks.find(
    (task) =>
      ["todo", "in_progress"].includes(task.status) &&
      task.steps.some((step) => !step.completed),
  );
  assert.ok(task);
  if (task.status === "todo") {
    const started = await call(
      `/tasks/${task.id}/actions`,
      "POST",
      operator.token,
      { type: "start", expectedRevision: task.revision },
    );
    assert.equal(started.status, 201);
    task = await started.json();
    checks++;
  }
  const step = task.steps.find((value) => !value.completed);
  const marked = await call(
    `/tasks/${task.id}/actions`,
    "POST",
    operator.token,
    {
      type: "step",
      expectedRevision: task.revision,
      stepId: step.id,
      completed: true,
    },
  );
  assert.equal(marked.status, 201);
  const updated = await marked.json();
  assert.equal(
    updated.steps.find((value) => value.id === step.id).completed,
    true,
  );
  checks++;
  const persisted = await (
    await call("/snapshot", "GET", operator.token)
  ).json();
  assert.equal(
    persisted.tasks
      .find((value) => value.id === task.id)
      .steps.find((value) => value.id === step.id).completed,
    true,
  );
  checks++;

  const seed = spawnSync(process.execPath, ["scripts/prepare-local-test.mjs"], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "pipe",
    windowsHide: true,
  });
  assert.equal(
    seed.status,
    0,
    "Seed idempotente deve concluir sem sobrescrever dados",
  );
  const afterSeed = await (
    await call("/snapshot", "GET", operator.token)
  ).json();
  assert.equal(
    afterSeed.tasks.find((value) => value.id === task.id).revision,
    updated.revision,
  );
  checks++;
  assert.deepEqual(
    await mainFingerprint(),
    before,
    "O tenant principal não deve ser alterado",
  );
  checks++;
  for (const token of tokens) {
    assert.equal((await call("/session", "DELETE", token)).status, 200);
    assert.equal((await call("/snapshot", "GET", token)).status, 401);
    checks++;
  }
  tokens.length = 0;
  console.log(
    `${checks} verificações HTTP/PostgreSQL do acesso temporário passaram; conta principal preservada.`,
  );
} finally {
  for (const token of tokens)
    await call("/session", "DELETE", token).catch(() => undefined);
  await pool.end();
}
