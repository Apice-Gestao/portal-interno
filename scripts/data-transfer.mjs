import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  exportData,
  importData,
} from "../apps/api/dist/database/data-transfer.js";
const root = fileURLToPath(new URL("../", import.meta.url));
if (existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
const action = process.argv[2];
if (!process.env.MIGRATION_DATABASE_URL)
  throw new Error(
    "MIGRATION_DATABASE_URL é obrigatória. Nenhuma conexão implícita será utilizada.",
  );
if (!["export", "import"].includes(action))
  throw new Error("Use export ou import <arquivo>.");
const pool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
try {
  if (action === "export") {
    const directory = path.join(root, "backups");
    mkdirSync(directory, { recursive: true });
    const file = path.join(
      directory,
      `portal-data-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    writeFileSync(file, JSON.stringify(await exportData(pool)), {
      mode: 0o600,
    });
    console.log(
      `Exportação privada salva em ${file}. Contém dados, arquivos e hashes de contas; sem tokens ou senhas em texto plano.`,
    );
  } else if (action === "import") {
    if (!process.argv[3])
      throw new Error(
        "Informe o arquivo privado de exportação. O destino deve estar migrado e vazio para estes tenants.",
      );
    const bundle = JSON.parse(
      readFileSync(path.resolve(process.argv[3]), "utf8"),
    );
    await importData(pool, bundle);
    console.log("Dados e evidências importados; hashes verificados.");
  } else throw new Error("Use export ou import <arquivo>.");
} finally {
  await pool.end();
}
