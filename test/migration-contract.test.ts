import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

interface PackageContract {
  name: string;
  bin: Record<string, string>;
  exports: Record<string, string>;
  pi: { extensions: string[] };
}

async function packageContract(): Promise<PackageContract> {
  return JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  ) as PackageContract;
}

test("Verity adds canonical binary and Pi adapter paths without breaking legacy", async () => {
  const pkg = await packageContract();
  assert.equal(pkg.name, "@pauleschwarz/pi-verity");
  assert.equal(pkg.bin.verity, "dist/cli.js");
  assert.equal(pkg.bin["pi-verity"], pkg.bin.verity);
  assert.equal(pkg.exports["./adapters/pi"], "./dist/adapter-pi/index.js");
  assert.equal(pkg.exports["./adapter-pi"], pkg.exports["./adapters/pi"]);
  assert.deepEqual(pkg.pi.extensions, ["./dist/adapter-pi/index.js"]);
});

test("legacy Pi persistence IDs remain stable while visible branding is Verity", async () => {
  const source = await readFile(join(root, "src/adapter-pi/index.ts"), "utf8");
  for (const id of [
    'setStatus?.("pi-verity"',
    'appendEntry("pi-verity"',
    'appendEntry("pi-verity-policy"',
    'customType: "pi-verity-failure"',
    'customType: "pi-verity-turn-contract"',
  ]) {
    assert.match(source, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /const prefix = theme === undefined \? "verity"/);
});

test("CLI help is simple and host-neutral", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "--help"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Usage:\n {2}verity verify/m);
  assert.match(result.stdout, /Legacy alias: pi-verity/);
  assert.equal(result.stderr, "");
});
