import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { analyzeScopeIntegrity } from "../src/core/scope-integrity.js";
import type { ScopeSeverity, ScopeSignalCode } from "../src/core/types.js";

interface EncodedFile {
  base64: string;
}

interface ExpectedSignal {
  code: ScopeSignalCode;
  severity: ScopeSeverity;
  file: string;
}

interface ScopeFixture {
  name: string;
  before: Record<string, string | EncodedFile>;
  after: Record<string, string | EncodedFile>;
  expected: ExpectedSignal | null;
  taskTouched?: string[];
}

const temporaryDirectories: string[] = [];
const fixturePath = join(import.meta.dirname, "fixtures", "scope-integrity.json");
const fixtureCases = JSON.parse(await readFile(fixturePath, "utf8")) as ScopeFixture[];

test.after(async () => {
  await Promise.all(
    temporaryDirectories.map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function materialize(
  root: string,
  files: Record<string, string | EncodedFile>,
): Promise<void> {
  for (const [path, value] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(
      destination,
      typeof value === "string" ? value : Buffer.from(value.base64, "base64"),
    );
  }
}

for (const fixture of fixtureCases) {
  test(`scope fixture: ${fixture.name}`, async () => {
    const parent = await mkdtemp(join(tmpdir(), "pi-verity-scope-"));
    temporaryDirectories.push(parent);
    const before = join(parent, "before");
    const after = join(parent, "after");
    await mkdir(before);
    await mkdir(after);
    await materialize(before, fixture.before);
    await materialize(after, fixture.after);
    const changedFiles = [
      ...new Set([...Object.keys(fixture.before), ...Object.keys(fixture.after)]),
    ];

    const evidence = await analyzeScopeIntegrity({
      root: after,
      baselineDirectory: before,
      changedFiles,
    });

    assert.equal(evidence.available, true);
    if (fixture.expected === null) {
      assert.deepEqual(evidence.signals, []);
      return;
    }
    const fired = evidence.signals.find((item) => item.code === fixture.expected?.code);
    assert.ok(fired, `${fixture.expected.code} did not fire`);
    assert.equal(fired.severity, fixture.expected.severity);
    assert.equal(fired.file, fixture.expected.file);
    assert.ok(fired.observed.length > 0);
    assert.ok(fired.why.length > 0);
    if (fixture.taskTouched !== undefined)
      assert.deepEqual(evidence.task_touched, fixture.taskTouched);
  });
}

test("dependency evidence is precise and does not claim necessity", async () => {
  const fixture = fixtureCases[0];
  assert.ok(fixture);
  const parent = await mkdtemp(join(tmpdir(), "pi-verity-scope-wording-"));
  temporaryDirectories.push(parent);
  const before = join(parent, "before");
  const after = join(parent, "after");
  await mkdir(before);
  await mkdir(after);
  await materialize(before, fixture.before);
  await materialize(after, fixture.after);
  const evidence = await analyzeScopeIntegrity({
    root: after,
    baselineDirectory: before,
    changedFiles: ["package.json", "src/date.ts"],
  });
  const dependency = evidence.signals.find(
    (item) => item.code === "SCOPE_DEPENDENCY_ADDED",
  );
  assert.ok(dependency);
  assert.deepEqual(dependency.evidence, ["+ left-pad: ^1.3.0"]);
  assert.doesNotMatch(
    `${dependency.observed} ${dependency.why}`,
    /unnecessary|not needed|needless/i,
  );
});

test("non-version dependency specifiers are redacted from evidence", async () => {
  const parent = await mkdtemp(join(tmpdir(), "pi-verity-scope-redact-"));
  temporaryDirectories.push(parent);
  const before = join(parent, "before");
  const after = join(parent, "after");
  await mkdir(before);
  await mkdir(after);
  await materialize(before, { "package.json": '{"dependencies":{}}\n' });
  await materialize(after, {
    "package.json":
      '{"dependencies":{"private-package":"https://token@example.invalid/package.tgz"}}\n',
  });
  const evidence = await analyzeScopeIntegrity({
    root: after,
    baselineDirectory: before,
    changedFiles: ["package.json"],
  });
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /token@example/);
  assert.match(serialized, /specifier redacted/);
});

test("repository-relative paths cannot escape the analyzed roots", async () => {
  await assert.rejects(
    analyzeScopeIntegrity({
      root: tmpdir(),
      baselineDirectory: tmpdir(),
      changedFiles: ["../outside"],
    }),
    /Invalid repository-relative path/,
  );
});

test("broad spread warns but does not fail based on patch size", async () => {
  const parent = await mkdtemp(join(tmpdir(), "pi-verity-scope-broad-"));
  temporaryDirectories.push(parent);
  const before = join(parent, "before");
  const after = join(parent, "after");
  await mkdir(before);
  await mkdir(after);
  const files = Array.from({ length: 25 }, (_, index) => `src/file-${index}.txt`);
  for (const path of files) {
    await materialize(before, { [path]: "before\n" });
    await materialize(after, { [path]: "after\n" });
  }
  const evidence = await analyzeScopeIntegrity({
    root: after,
    baselineDirectory: before,
    changedFiles: files,
  });
  const broad = evidence.signals.find(
    (item) => item.code === "SCOPE_BROAD_FILE_SPREAD",
  );
  assert.equal(broad?.severity, "WARNING");
  assert.doesNotMatch(broad?.why ?? "", /fails? because/i);
});

test("dirty baseline without exact workspace is reported as unavailable", async () => {
  const evidence = await analyzeScopeIntegrity({
    root: tmpdir(),
    changedFiles: ["src/date.ts"],
    baselineRef: "HEAD",
    baselineDirty: true,
  });
  assert.equal(evidence.available, false);
  assert.equal(evidence.baseline_source, "unavailable");
  assert.match(evidence.reason ?? "", /dirty/);
  assert.deepEqual(evidence.signals, []);
});
