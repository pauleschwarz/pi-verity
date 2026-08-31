import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { formatTestDelta, summarizeTestDelta } from "../src/core/test-delta.js";

async function fixture(): Promise<{ root: string; baseline: string }> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-test-delta-"));
  const baseline = await mkdtemp(join(tmpdir(), "pi-verity-test-delta-base-"));
  await mkdir(join(root, "test"), { recursive: true });
  await mkdir(join(baseline, "test"), { recursive: true });
  await writeFile(
    join(baseline, "test", "value.test.ts"),
    "test('a', () => { assert.equal(1, 1); });\n",
  );
  // Build sample tokens without embedding live skip/suppression directives in
  // this test file itself (scope integrity would otherwise fail the package).
  const skipCall = ["test", ".skip"].join("");
  const typeIgnore = ["@", "ts-ignore"].join("");
  await writeFile(
    join(root, "test", "value.test.ts"),
    `${skipCall}('a', () => { assert.equal(1, 1); });\n// ${typeIgnore}\n`,
  );
  return { root, baseline };
}

test("summarizeTestDelta reports mechanical weakening facts", async () => {
  const { root, baseline } = await fixture();
  const delta = await summarizeTestDelta({
    root,
    changedFiles: ["test/value.test.ts"],
    baselineDirectory: baseline,
    baselineDirty: false,
  });
  assert.equal(delta.available, true);
  assert.equal(delta.files_modified, 1);
  assert.ok(delta.skips_added >= 1);
  assert.ok(delta.suppressions_added >= 1);
  assert.equal(delta.weakened, true);
  assert.match(formatTestDelta(delta), /modified/);
});

test("summarizeTestDelta is unavailable without a baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-test-delta-empty-"));
  const delta = await summarizeTestDelta({
    root,
    changedFiles: ["test/value.test.ts"],
    baselineDirty: true,
  });
  assert.equal(delta.available, false);
  assert.equal(formatTestDelta(delta), "");
});
