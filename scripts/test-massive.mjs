import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && existsSync(npmCli), "Execute por npm run test:massive.");
const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? "");
const runtime = new URL(process.env.DATABASE_URL ?? "");
for (const url of [migration, runtime]) {
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.port, "55432", "Use somente o PostgreSQL dedicado local.");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(url.pathname.length > 1 && url.pathname !== "/postgres");
}
assert.equal(
  migration.pathname,
  runtime.pathname,
  "Conexões precisam apontar para a mesma base principal.",
);
const directory = path.join(
  root,
  ".local",
  "verification",
  `massive-${randomUUID()}`,
);
mkdirSync(directory, { recursive: true });
const summaryFile = path.join(
  root,
  ".local",
  "verification",
  "massive-latest.json",
);
const summary = {
  startedAt: new Date().toISOString(),
  scope:
    "Funções, API, PostgreSQL, carga e recuperação em bases temporárias; base principal somente leitura para conferir preservação.",
  steps: [],
  browser:
    "Não incluído nesta bateria. Execute testes de navegador separadamente quando o controle estiver disponível.",
};
const safe = (message) =>
  String(message)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[conexão privada]")
    .slice(0, 500);
const mainPool = new pg.Pool({ connectionString: migration.href, max: 1 });
const catalogUrl = new URL(migration);
catalogUrl.pathname = "/postgres";
const catalogPool = new pg.Pool({ connectionString: catalogUrl.href, max: 1 });
const temporaryPattern =
  /^apice_(?:test|workflow|onboarding|tv)_(?:(?:restore|portable)_)?[a-f0-9]{12}$/;

async function temporaryDatabases() {
  const { rows } = await catalogPool.query("SELECT datname FROM pg_database");
  return rows
    .map((row) => row.datname)
    .filter((name) => temporaryPattern.test(name))
    .sort();
}
async function mainFingerprint() {
  const client = await mainPool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='30s'");
    const tables = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='portal' ORDER BY tablename",
    );
    const hash = createHash("sha256");
    for (const { tablename } of tables.rows) {
      // Row digests are kept only in memory; no credential or business data enters the report.
      const result = await client.query(
        `SELECT md5(COALESCE(string_agg(digest,'' ORDER BY digest),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS digest FROM portal.${pg.escapeIdentifier(tablename)} t) rows`,
      );
      hash.update(tablename).update(result.rows[0].digest);
    }
    await client.query("COMMIT");
    return hash.digest("hex");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runStep(name, args, artifact) {
  console.log(`\n[TESTES MASSIVOS] ${name}`);
  const started = Date.now();
  const output = [];
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        NO_COLOR: "1",
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      output.push(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output.push(chunk);
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", resolve);
  });
  const text = Buffer.concat(output).toString("utf8");
  writeFileSync(path.join(directory, `${summary.steps.length + 1}.log`), text);
  const item = {
    name,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
    durationMs: Date.now() - started,
  };
  if (name === "Tipagem, lint, propriedades e builds") {
    const count = [...text.matchAll(/Tests\s+(\d+) passed/g)].at(-1);
    if (count) item.tests = Number(count[1]);
  }
  if (artifact && existsSync(path.join(root, artifact))) {
    const report = JSON.parse(readFileSync(path.join(root, artifact), "utf8"));
    assert.ok(report.checks && ["passed", "failed"].includes(report.status));
    item.scenarios = report.checks.length;
    if (report.load) item.load = report.load;
    if (report.cleanup) item.cleanup = report.cleanup;
    writeFileSync(
      path.join(directory, `${path.basename(artifact)}`),
      JSON.stringify(report, null, 2),
    );
  }
  summary.steps.push(item);
  if (exitCode !== 0)
    throw new Error(`A etapa ${name} falhou; consulte o relatório privado.`);
}

let before, existingTemporary;
try {
  before = await mainFingerprint();
  existingTemporary = await temporaryDatabases();
  await runStep("Tipagem, lint, propriedades e builds", [
    npmCli,
    "run",
    "check",
  ]);
  await runStep(
    "Carga, concorrência, identidade e recuperação",
    ["scripts/test-database.mjs"],
    ".local/verification/database-massive.json",
  );
  await runStep(
    "Modelos e versões de fluxos",
    ["scripts/test-template-workflow.mjs"],
    ".local/verification/template-workflow.json",
  );
  await runStep(
    "Jornadas entre módulos e relatórios",
    ["scripts/test-department-flows.mjs"],
    ".local/verification/department-flows.json",
  );
  await runStep(
    "TV, dispositivos e departamentos",
    ["scripts/test-tv.mjs"],
    ".local/verification/tv.json",
  );
  summary.status = "passed";
} catch (error) {
  summary.status = "failed";
  summary.failure = safe(error.message);
  process.exitCode = 1;
} finally {
  try {
    if (before)
      summary.mainDatabaseUnchanged = before === (await mainFingerprint());
    if (existingTemporary)
      summary.newTemporaryDatabasesRemaining = (
        await temporaryDatabases()
      ).filter((name) => !existingTemporary.includes(name)).length;
    if (
      summary.mainDatabaseUnchanged === false ||
      summary.newTemporaryDatabasesRemaining > 0
    ) {
      summary.status = "failed";
      summary.failure =
        "A verificação de preservação/limpeza exige revisão; não atribuir mudança externa aos testes sem investigar.";
      process.exitCode = 1;
    }
  } catch (error) {
    summary.status = "failed";
    summary.failure = safe(error.message);
    process.exitCode = 1;
  }
  await mainPool.end();
  await catalogPool.end();
  summary.finishedAt = new Date().toISOString();
  writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(
    path.join(directory, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    `\nBateria massiva: ${summary.status}. Resultado privado: .local/verification/massive-latest.json`,
  );
}
