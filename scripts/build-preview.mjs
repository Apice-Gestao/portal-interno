import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const [command, args, cwd] of [
  ["typescript/bin/tsc", ["-p", "packages/domain/tsconfig.json"], root],
  ["vite/bin/vite.js", ["build", "--base", "./"], path.join(root, "apps/web")],
]) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", command), ...args],
    { cwd, env: { ...process.env, VITE_DATA_MODE: "demo" }, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Hosted previews refuse a literal U+FFFD; libraries ship it inside string
// literals (encoding tables), where the \ufffd escape means exactly the same.
const assets = path.join(root, "dist", "assets");
for (const name of readdirSync(assets).filter((file) => file.endsWith(".js"))) {
  const file = path.join(assets, name);
  const source = readFileSync(file, "utf8");
  if (source.includes("\ufffd"))
    writeFileSync(file, source.replaceAll("\ufffd", "\\ufffd"));
}
