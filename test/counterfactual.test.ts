import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { captureGitSnapshot } from "../src/core/git.js";
import { verifyRepository } from "../src/core/verifier.js";
import { captureCounterfactualBaseline } from "../src/core/workspace.js";

const execFileAsync = promisify(execFile);
const fixtures: string[] = [];

test.after(async () => {
  await Promise.all(fixtures.map((path) => rm(path, { recursive: true, force: true })));
});

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root });
}

async function repository(
  initialTest?: string,
  script = "node --test",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-counterfactual-"));
  fixtures.push(root);
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "proof@example.invalid");
  await git(root, "config", "user.name", "Proof Fixture");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ type: "module", scripts: { test: script } }),
  );
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return false; }\n",
  );
  if (initialTest !== undefined) {
    await mkdir(join(root, "test"));
    await writeFile(join(root, "test", "behavior.test.js"), initialTest);
  }
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "baseline");
  return root;
}

async function captured(root: string) {
  return {
    baseline: await captureGitSnapshot(root),
    counterfactualBaseline: await captureCounterfactualBaseline(root),
  };
}

const usefulTest = `import test from "node:test";
import assert from "node:assert/strict";
import { enabled } from "../source.js";
test("feature is enabled", () => assert.equal(enabled(), true));
`;

async function verify(
  root: string,
  capture: Awaited<ReturnType<typeof captured>>,
  timeoutMs = 3_000,
) {
  return verifyRepository({
    cwd: root,
    ...capture,
    timeoutMs,
    maxWorkspaceBytes: 16 * 1024 * 1024,
  });
}

test("a useful regression test is proven RED on baseline and GREEN on candidate", async () => {
  const root = await repository();
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(join(root, "test", "behavior.test.js"), usefulTest);
  const receipt = await verify(root, capture);
  assert.equal(receipt.counterfactual?.classification, "PROVEN_REGRESSION");
  assert.notEqual(receipt.counterfactual?.baseline_result?.exit_code, 0);
  assert.equal(receipt.counterfactual?.candidate_result?.exit_code, 0);
  assert.equal(receipt.verdict, "PASS");
});

test("a useless always-passing test is non-discriminating", async () => {
  const root = await repository();
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(
    join(root, "test", "behavior.test.js"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\ntest("always", () => assert.equal(true, true));\n`,
  );
  const receipt = await verify(root, capture);
  assert.equal(receipt.counterfactual?.classification, "NON_DISCRIMINATING_TEST");
  assert.equal(receipt.verdict, "UNPROVEN");
});

test("a weakened assertion is detected", async () => {
  const root = await repository(usefulTest);
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await writeFile(
    join(root, "test", "behavior.test.js"),
    `import test from "node:test";\ntest("feature is enabled", () => {});\n`,
  );
  const receipt = await verify(root, capture);
  assert.equal(receipt.counterfactual?.classification, "NON_DISCRIMINATING_TEST");
  assert.ok(
    receipt.counterfactual?.anti_gaming_signals.some(
      (signal) => signal.kind === "ASSERTION_REMOVED",
    ),
  );
  assert.equal(receipt.verdict, "UNPROVEN");
});

test("a skipped failing test is detected", async () => {
  const root = await repository(usefulTest);
  const capture = await captured(root);
  await writeFile(
    join(root, "test", "behavior.test.js"),
    usefulTest.replace('test("feature', 'test.skip("feature'),
  );
  const receipt = await verify(root, capture);
  assert.equal(receipt.counterfactual?.classification, "NON_DISCRIMINATING_TEST");
  assert.ok(
    receipt.counterfactual?.anti_gaming_signals.some(
      (signal) => signal.kind === "TEST_SKIPPED",
    ),
  );
  assert.equal(
    receipt.scope_integrity.signals.some(
      (signal) => signal.code === "SCOPE_TEST_SKIPPED",
    ),
    true,
  );
  assert.equal(receipt.verdict, "FAIL");
});

test("implementation can pass while its weak test also passes on baseline", async () => {
  const root = await repository();
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(
    join(root, "test", "behavior.test.js"),
    `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { enabled } from "../source.js";\ntest("returns a boolean", () => assert.equal(typeof enabled(), "boolean"));\n`,
  );
  const receipt = await verify(root, capture);
  assert.equal(receipt.verification_commands[0]?.exit_code, 0);
  assert.equal(receipt.counterfactual?.candidate_result?.exit_code, 0);
  assert.equal(receipt.counterfactual?.baseline_result?.exit_code, 0);
  assert.equal(receipt.counterfactual?.classification, "NON_DISCRIMINATING_TEST");
});

test("a valid fix records baseline RED and candidate GREEN", async () => {
  const root = await repository();
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(join(root, "test", "behavior.test.js"), usefulTest);
  const evidence = (await verify(root, capture)).counterfactual;
  assert.deepEqual(
    {
      classification: evidence?.classification,
      baseline: evidence?.baseline_result?.exit_code === 0,
      candidate: evidence?.candidate_result?.exit_code === 0,
    },
    { classification: "PROVEN_REGRESSION", baseline: false, candidate: true },
  );
});

test("dirty working tree remains isolated and unchanged", async () => {
  const root = await repository();
  await writeFile(join(root, "notes.txt"), "pre-existing dirty data\n");
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(join(root, "test", "behavior.test.js"), usefulTest);
  const receipt = await verify(root, capture);
  assert.equal(receipt.baseline?.dirty, true);
  assert.equal(receipt.counterfactual?.classification, "PROVEN_REGRESSION");
  assert.equal(
    await readFile(join(root, "notes.txt"), "utf8"),
    "pre-existing dirty data\n",
  );
});

test("counterfactual timeout is INCONCLUSIVE and never PASS", async () => {
  const root = await repository(undefined, "node --test");
  const capture = await captured(root);
  await writeFile(
    join(root, "source.js"),
    "export function enabled() { return true; }\n",
  );
  await mkdir(join(root, "test"));
  await writeFile(
    join(root, "test", "behavior.test.js"),
    `import test from "node:test";\ntest("slow", async () => { await new Promise((resolve) => setTimeout(resolve, 5000)); });\n`,
  );
  const receipt = await verify(root, capture, 100);
  assert.equal(receipt.counterfactual?.classification, "INCONCLUSIVE");
  assert.notEqual(receipt.verdict, "PASS");
  assert.notEqual(receipt.verdict, "PASS_WITH_WARNINGS");
});
