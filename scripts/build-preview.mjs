import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const [command, args, cwd] of [
  ["typescript/bin/tsc", ["-p", "packages/domain/tsconfig.json"], root],
  ["vite/bin/vite.js", ["build"], path.join(root, "apps/web")],
]) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", command), ...args],
    { cwd, env: { ...process.env, VITE_DATA_MODE: "demo" }, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
