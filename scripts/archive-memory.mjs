import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const base = "http://127.0.0.1:3001/api/v1";
const archive = path.join(root, ".local", "memory-archive");
const health = await fetch(`${base}/health`).then((r) => r.json());
if (health.persistence !== "memory")
  throw new Error(
    "Este comando arquiva somente a demonstração em memória, sem alterar um banco existente.",
  );
const session = await fetch(`${base}/demo-session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: "helena" }),
}).then((r) => r.json());
if (!session.token) throw new Error("Sessão local de leitura indisponível.");
try {
  const headers = { Authorization: `Bearer ${session.token}` };
  const response = await fetch(`${base}/snapshot`, { headers });
  if (!response.ok) throw new Error("Não foi possível arquivar o snapshot.");
  const state = await response.json();
  mkdirSync(path.join(archive, "documents"), { recursive: true });
  for (const task of state.tasks)
    for (const doc of task.documents) {
      if (!/^[a-zA-Z0-9_-]+$/.test(doc.id))
        throw new Error("ID de documento incompatível com arquivo local.");
      const result = await fetch(
        `${base}/tasks/${encodeURIComponent(task.id)}/documents/${encodeURIComponent(doc.id)}/download`,
        { headers },
      );
      if (!result.ok)
        throw new Error("Download de arquivo da demonstração falhou.");
      writeFileSync(
        path.join(archive, "documents", doc.id),
        Buffer.from(await result.arrayBuffer()),
      );
    }
  writeFileSync(
    path.join(archive, "state.json"),
    JSON.stringify(state, null, 2) + "\n",
  );
  console.log(
    `Demonstração arquivada privadamente: ${state.companies.length} empresas, ${state.tasks.length} tarefas e ${state.tasks.reduce((n, t) => n + t.documents.length, 0)} versões de evidência.`,
  );
} finally {
  await fetch(`${base}/session`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` },
  });
}
