import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
const root = fileURLToPath(new URL("../", import.meta.url));
const local = path.join(root, ".local", "postgres");
const data = path.join(local, "data");
const marker = path.join(local, "instance.json");
const envFile = path.join(root, ".env");
const action = process.argv[2] ?? "start";
const bin =
  process.env.PG_BIN_DIR ??
  (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
const exe = (name) =>
  bin
    ? path.join(bin, name + (process.platform === "win32" ? ".exe" : ""))
    : name;
function run(name, args) {
  if (name === "pg_ctl" && args[0] === "start") {
    const log = path.join(local, "launcher.log");
    const fd = openSync(log, "a");
    try {
      const result = spawnSync(exe(name), args, {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", fd, fd],
      });
      if (result.status !== 0)
        throw new Error(
          "pg_ctl falhou; consulte .local/postgres/launcher.log.",
        );
      return "";
    } finally {
      closeSync(fd);
    }
  }
  const result = spawnSync(exe(name), args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error(
      `${name} falhou: ${result.stderr || result.stdout || "verifique o runtime PostgreSQL"}`,
    );
  return result.stdout;
}
function verifyOwned() {
  if (
    !existsSync(marker) ||
    JSON.parse(readFileSync(marker, "utf8")).project !== "portal-apice"
  )
    throw new Error(
      "Instância local não identificada como pertencente ao Portal Ápice.",
    );
}
function loadEnv() {
  if (!existsSync(envFile))
    throw new Error("Execute npm run db:setup primeiro.");
  process.loadEnvFile(envFile);
}
if (action === "setup") {
  mkdirSync(local, { recursive: true });
  if (existsSync(path.join(data, "PG_VERSION"))) {
    verifyOwned();
    console.log("Instância exclusiva já inicializada.");
  } else {
    if (existsSync(envFile))
      throw new Error(
        ".env já existe; configure o banco explicitamente para preservar suas configurações.",
      );
    const ownerPassword = randomBytes(32).toString("base64url");
    const runtimePassword = randomBytes(32).toString("base64url");
    const passwordFile = path.join(local, "init-password");
    writeFileSync(passwordFile, ownerPassword + "\n", { mode: 0o600 });
    run("initdb", [
      "-D",
      data,
      "--username=apice_owner",
      "--encoding=UTF8",
      "--locale=C",
      "--auth-host=scram-sha-256",
      "--auth-local=scram-sha-256",
      `--pwfile=${passwordFile}`,
    ]);
    appendFileSync(
      path.join(data, "postgresql.conf"),
      "\nlisten_addresses = '127.0.0.1'\nport = 55432\npassword_encryption = 'scram-sha-256'\nlog_min_error_statement = 'panic'\n",
    );
    writeFileSync(
      marker,
      JSON.stringify(
        {
          project: "portal-apice",
          port: 55432,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(
      envFile,
      `PORTAL_STORAGE=postgres\nDATABASE_URL=postgresql://apice_runtime:${runtimePassword}@127.0.0.1:55432/apice_portal\nMIGRATION_DATABASE_URL=postgresql://apice_owner:${ownerPassword}@127.0.0.1:55432/apice_portal\nPORTAL_TIMEZONE=America/Sao_Paulo\n`,
      { mode: 0o600 },
    );
    writeFileSync(passwordFile, "", { mode: 0o600 });
    console.log(
      "Cluster exclusivo inicializado em .local/postgres, sem alterar bancos existentes.",
    );
  }
  loadEnv();
  verifyOwned();
  const status = spawnSync(exe("pg_ctl"), ["status", "-D", data], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (status.status !== 0)
    run("pg_ctl", [
      "start",
      "-D",
      data,
      "-l",
      path.join(local, "server.log"),
      "-w",
      "-t",
      "30",
    ]);
  const ownerUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  ownerUrl.pathname = "/postgres";
  const pool = new pg.Pool({ connectionString: ownerUrl.href });
  try {
    const runtimeUrl = new URL(process.env.DATABASE_URL);
    if (
      !(
        await pool.query(
          "SELECT 1 FROM pg_roles WHERE rolname = 'apice_runtime'",
        )
      ).rowCount
    ) {
      await pool.query(
        `CREATE ROLE apice_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${pg.escapeLiteral(decodeURIComponent(runtimeUrl.password))}`,
      );
    }
    if (
      !(
        await pool.query(
          "SELECT 1 FROM pg_database WHERE datname = 'apice_portal'",
        )
      ).rowCount
    )
      await pool.query("CREATE DATABASE apice_portal OWNER apice_owner");
  } finally {
    await pool.end();
  }
  console.log(
    "Banco apice_portal pronto em 127.0.0.1:55432. Credenciais locais protegidas pelo .gitignore.",
  );
} else if (action === "start") {
  verifyOwned();
  loadEnv();
  const result = spawnSync(exe("pg_ctl"), ["status", "-D", data], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0)
    run("pg_ctl", [
      "start",
      "-D",
      data,
      "-l",
      path.join(local, "server.log"),
      "-w",
      "-t",
      "30",
    ]);
  console.log("PostgreSQL exclusivo do Portal disponível.");
} else if (action === "stop") {
  verifyOwned();
  run("pg_ctl", ["stop", "-D", data, "-m", "fast", "-w"]);
  console.log("Somente a instância do Portal foi interrompida.");
} else if (action === "backup") {
  verifyOwned();
  loadEnv();
  mkdirSync(path.join(root, "backups"), { recursive: true });
  const url = new URL(process.env.MIGRATION_DATABASE_URL);
  const output = path.join(
    root,
    "backups",
    `apice-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
  );
  const result = spawnSync(
    exe("pg_dump"),
    [
      "-h",
      url.hostname,
      "-p",
      url.port,
      "-U",
      decodeURIComponent(url.username),
      "-d",
      url.pathname.slice(1),
      "-Fc",
      "--no-owner",
      "--no-acl",
      "-f",
      output,
    ],
    {
      windowsHide: true,
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
    },
  );
  if (result.status !== 0)
    throw new Error("Falha no backup; consulte a disponibilidade do banco.");
  console.log(
    `Backup salvo em ${output}. O arquivo contém dados e deve permanecer privado.`,
  );
} else throw new Error("Ação inválida: setup, start, stop ou backup.");
