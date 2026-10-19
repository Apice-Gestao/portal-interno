import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import {
  existsSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createSeed } from "../packages/domain/dist/index.js";
import { migrateDatabase } from "../apps/api/dist/database/migrations.js";
import { seedDatabase } from "../apps/api/dist/database/postgres-store.js";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
assert.ok(
  process.env.MIGRATION_DATABASE_URL && process.env.DATABASE_URL,
  "Os testes de autenticação exigem o PostgreSQL local configurado.",
);
const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL);
const runtimeUrl = new URL(process.env.DATABASE_URL);
for (const url of [ownerUrl, runtimeUrl]) {
  assert.ok(
    ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55432",
    "Fixtures de autenticação só podem usar a instância local dedicada na porta 55432.",
  );
}
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `apice_auth_test_${suffix}`;
const databaseUrl = (url, databaseName) => {
  const copy = new URL(url);
  copy.pathname = `/${databaseName}`;
  return copy.href;
};
const adminPool = new pg.Pool({
  connectionString: databaseUrl(ownerUrl, "postgres"),
  max: 1,
});
let ownerPool;
let databaseCreated = false;
let cleanupPromise;
let stopResolve;
const stopped = new Promise((resolve) => {
  stopResolve = resolve;
});
const children = [];
const controlFile = path.join(root, ".local", "auth-test-control.json");
// Verification codes go to a private local mailbox the browser test reads.
const mailDirectory = `.local/auth-test-mail-${suffix}`;
const controlToken = randomBytes(32).toString("hex");
const control = createServer(async (req, res) => {
  if (
    req.method !== "POST" ||
    req.url !== "/shutdown" ||
    req.headers.authorization !== `Bearer ${controlToken}`
  ) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    await cleanup();
    res.end("ok");
    stopResolve();
  } catch {
    res.writeHead(500);
    res.end("Falha no encerramento do teste.");
    stopResolve();
  }
});

async function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    for (const child of children)
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    await Promise.all(
      children.map(
        (child) =>
          new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null)
              return resolve();
            const timer = setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null)
                child.kill("SIGKILL");
              resolve();
            }, 5000);
            child.once("exit", () => {
              clearTimeout(timer);
              resolve();
            });
          }),
      ),
    );
    await ownerPool?.end();
    if (databaseCreated) {
      assert.match(database, /^apice_auth_test_[a-f0-9]{12}$/);
      assert.equal(database, `apice_auth_test_${suffix}`);
      await adminPool.query(
        `DROP DATABASE ${pg.escapeIdentifier(database)} WITH (FORCE)`,
      );
      console.info("Base temporária dos testes de autenticação removida.");
    }
    await adminPool.end();
  })();
  return cleanupPromise;
}

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stopResolve());

function startChild(args, cwd, environment) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    env: environment,
  });
  children.push(child);
  child.on("error", () => {
    process.exitCode = 1;
    stopResolve();
  });
  child.on("exit", (code) => {
    if (!cleanupPromise) {
      process.exitCode = code || 1;
      stopResolve();
    }
  });
  return child;
}

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (
      children.some(
        (child) => child.exitCode !== null || child.signalCode !== null,
      )
    )
      throw new Error("A API temporária de autenticação não iniciou.");
    try {
      const response = await fetch("http://127.0.0.1:3002/api/v1/health", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.persistence, "postgres");
        // Password login, with the e-mail second factor when configured.
        assert.match(health.authentication, /^password(\+email-mfa)?$/);
        return;
      }
    } catch {
      /* O processo ainda está iniciando. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("A API temporária não ficou disponível dentro do prazo.");
}

try {
  await new Promise((resolve, reject) => {
    control.once("error", reject);
    control.listen(5185, "127.0.0.1", resolve);
  });
  mkdirSync(path.dirname(controlFile), { recursive: true });
  writeFileSync(
    controlFile,
    JSON.stringify({ token: controlToken, port: 5185, database, mailDirectory }),
    { mode: 0o600 },
  );
  await adminPool.query(`CREATE DATABASE ${pg.escapeIdentifier(database)}`);
  databaseCreated = true;
  ownerPool = new pg.Pool({
    connectionString: databaseUrl(ownerUrl, database),
    max: 1,
  });
  await migrateDatabase(ownerPool, runtimeUrl.username);
  await seedDatabase(ownerPool, createSeed());
  const bootstrap = spawnSync(
    process.execPath,
    [path.join(root, "scripts/bootstrap-admin.mjs")],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        MIGRATION_DATABASE_URL: databaseUrl(ownerUrl, database),
        PORTAL_TENANT_ID: "apice-demo",
        PORTAL_BOOTSTRAP_USERNAME: "teste-admin",
        PORTAL_BOOTSTRAP_PASSWORD: "TemporaryTest2026!",
      },
    },
  );
  assert.equal(
    bootstrap.status,
    0,
    "Não foi possível criar a conta sintética de teste.",
  );
  const environment = {
    ...process.env,
    NODE_ENV: "development",
    PORTAL_TENANT_ID: "apice-demo",
    PORTAL_STORAGE: "postgres",
    DATABASE_URL: databaseUrl(runtimeUrl, database),
    ENABLE_DEMO_SESSIONS: "false",
    ENABLE_LOCAL_TEST_LOGIN: "false",
    PORTAL_API_PORT: "3002",
    API_PROXY_TARGET: "http://127.0.0.1:3002",
    PORTAL_WEB_ORIGIN: "http://127.0.0.1:5175",
    MAIL_DELIVERY: "local",
    MAIL_OUTBOX_DIR: mailDirectory,
    MFA_SECRET: randomBytes(32).toString("hex"),
  };
  for (const key of [
    "MIGRATION_DATABASE_URL",
    "PORTAL_BOOTSTRAP_USERNAME",
    "PORTAL_BOOTSTRAP_PASSWORD",
  ])
    delete environment[key];
  startChild([path.join(root, "apps/api/dist/main.js")], root, environment);
  await waitForApi();
  startChild(
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort",
    ],
    path.join(root, "apps/web"),
    environment,
  );
  console.info("Autenticação em teste: interface local isolada na porta 5175.");
  await stopped;
} catch {
  console.error(
    "Falha na inicialização dos testes de autenticação; revise build, migrações e PostgreSQL local.",
  );
  process.exitCode = 1;
} finally {
  await cleanup();
  control.close();
  if (existsSync(controlFile)) unlinkSync(controlFile);
  rmSync(path.join(root, mailDirectory), { recursive: true, force: true });
}
