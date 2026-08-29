import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const compiler = join("node_modules", "typescript", "bin", "tsc");
const requiredBuildFiles = ["dist/adapter-pi/index.js", "dist/cli.js"];

try {
  await access(compiler);
} catch {
  await Promise.all(requiredBuildFiles.map((file) => access(file)));
  console.log("pi-verity: using the prebuilt release files in dist/");
  process.exit(0);
}

const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
  stdio: "inherit",
});
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
