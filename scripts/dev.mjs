import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const localTest = process.env.ENABLE_LOCAL_TEST_LOGIN === "true";
const tsc = path.join(root, "node_modules/typescript/bin/tsc");
const built = spawnSync(
  process.execPath,
  [tsc, "-p", "packages/domain/tsconfig.json"],
  { cwd: root, stdio: "inherit" },
);
if (built.status !== 0) process.exit(built.status ?? 1);
if (process.env.PORTAL_STORAGE === "postgres") {
  for (const args of [
    [path.join(root, "scripts/local-db.mjs"), "start"],
    [tsc, "-p", "apps/api/tsconfig.json"],
    [path.join(root, "scripts/migrate.mjs")],
    [path.join(root, "scripts/seed.mjs")],
    ...(localTest
      ? [
          [path.join(root, "scripts/prepare-local-test.mjs")],
          // TEMPORARY: fictitious demonstration records (remove before the VPS).
          [path.join(root, "scripts/prepare-demo-data.mjs")],
        ]
      : []),
    ...(process.env.PORTAL_BOOTSTRAP_USERNAME &&
    process.env.PORTAL_BOOTSTRAP_PASSWORD
      ? [[path.join(root, "scripts/bootstrap-admin.mjs")]]
      : []),
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, NODE_ENV: "development" },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
const apiEnvironment = {
  ...process.env,
  NODE_ENV: "development",
  ENABLE_DEMO_SESSIONS: "false",
};
delete apiEnvironment.MIGRATION_DATABASE_URL;
delete apiEnvironment.PORTAL_BOOTSTRAP_PASSWORD;
delete apiEnvironment.PORTAL_BOOTSTRAP_USERNAME;
const api = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/tsx/dist/cli.mjs"),
    "--tsconfig",
    "apps/api/tsconfig.json",
    "apps/api/src/main.ts",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: apiEnvironment,
  },
);
const web = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  { cwd: path.join(root, "apps/web"), stdio: "inherit" },
);
const children = [api, web];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
