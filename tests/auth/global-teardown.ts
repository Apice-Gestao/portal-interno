import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
export default async function teardown() {
  const file = path.resolve(".local/auth-test-control.json");
  if (!existsSync(file)) return;
  const control = JSON.parse(readFileSync(file, "utf8")) as {
    token: string;
    port: number;
    database: string;
  };
  if (
    control.port !== 5185 ||
    !/^apice_auth_test_[a-f0-9]{12}$/.test(control.database)
  )
    throw new Error("Instância de teste não identificada.");
  const response = await fetch("http://127.0.0.1:5185/shutdown", {
    method: "POST",
    headers: { Authorization: `Bearer ${control.token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error("Não foi possível encerrar a instância de teste.");
}
