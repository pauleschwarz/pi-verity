import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { discoverVerification } from "../src/core/discovery.js";
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

async function fixture(script = 'node -e "process.exit(0)"'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-test-"));
  fixtures.push(root);
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "proof@example.invalid");
  await git(root, "config", "user.name", "Proof Fixture");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { test: script } }),
  );
  await writeFile(join(root, "source.js"), "export const value = 1;\n");
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "fixture");
  return root;
}

async function editAfterBaseline(
  root: string,
): Promise<ReturnType<typeof captureGitSnapshot>> {
  const baseline = await captureGitSnapshot(root);
  await writeFile(join(root, "source.js"), "export const value = 2;\n");
  return baseline;
}

test("clean repo passes without running unnecessary commands", async () => {
  const root = await fixture();
  const receipt = await verifyRepository({ cwd: root });
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.baseline?.dirty, false);
  assert.equal(receipt.repository_changed_since_baseline, false);
  assert.deepEqual(receipt.verification_commands, []);
});

test("dirty baseline is preserved and never called clean", async () => {
  const root = await fixture();
  await writeFile(join(root, "source.js"), "pre-existing dirty state\n");
  const receipt = await verifyRepository({ cwd: root });
  assert.equal(receipt.verdict, "PASS_WITH_WARNINGS");
  assert.equal(receipt.baseline?.dirty, true);
  assert.match(receipt.warnings.join("\n"), /dirty/);
  assert.equal(
    await readFile(join(root, "source.js"), "utf8"),
    "pre-existing dirty state\n",
  );
});

test("one edited source file runs the discovered test in an isolated copy", async () => {
  const root = await fixture(
    "node -e \"require('fs').writeFileSync('generated.txt','copy only')\"",
  );
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({ cwd: root, baseline });
  assert.equal(receipt.verdict, "PASS");
  assert.deepEqual(receipt.changed_files, ["source.js"]);
  assert.equal(receipt.verification_commands[0]?.exit_code, 0);
  await assert.rejects(readFile(join(root, "generated.txt")), {
    code: "ENOENT",
  });
});

test("scope WARNING produces PASS_WITH_WARNINGS without claiming necessity", async () => {
  const root = await fixture();
  const baseline = await captureGitSnapshot(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: { test: 'node -e "process.exit(0)"' },
      dependencies: { "left-pad": "^1.3.0" },
    }),
  );
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
  });
  assert.equal(receipt.verdict, "PASS_WITH_WARNINGS");
  const dependency = receipt.scope_integrity.signals.find(
    (item) => item.code === "SCOPE_DEPENDENCY_ADDED",
  );
  assert.equal(dependency?.severity, "WARNING");
  assert.doesNotMatch(dependency?.why ?? "", /unnecessary|needless/i);
});

test("scope INFORMATION does not lower a passing verdict", async () => {
  const root = await fixture();
  const baseline = await captureGitSnapshot(root);
  await writeFile(join(root, "package-lock.json"), '{"lockfileVersion":3}\n');
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
  });
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.scope_integrity.signals[0]?.severity, "INFORMATION");
});

test("scope FAIL detects an ignored secret-like file and does not emit contents", async () => {
  const root = await fixture();
  await writeFile(join(root, ".gitignore"), ".env*\n");
  await git(root, "add", ".gitignore");
  await git(root, "commit", "-qm", "ignore local environment");
  const counterfactualBaseline = await captureCounterfactualBaseline(root);
  const baseline = await captureGitSnapshot(root);
  await writeFile(join(root, ".env.production"), "TOKEN=not-emitted\n");
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
    counterfactualBaseline,
  });
  assert.equal(receipt.verdict, "FAIL");
  const secret = receipt.scope_integrity.signals.find(
    (item) => item.code === "SCOPE_SECRET_LIKE_FILE_ADDED",
  );
  assert.equal(secret?.severity, "FAIL");
  assert.doesNotMatch(JSON.stringify(secret), /not-emitted/);
});

test("failing test command produces FAIL", async () => {
  const root = await fixture(
    "node -e \"console.error('deterministic failure');process.exit(7)\"",
  );
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({ cwd: root, baseline });
  assert.equal(receipt.verdict, "FAIL");
  assert.equal(receipt.verification_commands[0]?.exit_code, 7);
  assert.match(receipt.verification_commands[0]?.stderr ?? "", /deterministic failure/);
});

test("missing test command is UNPROVEN", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { start: "node source.js" } }),
  );
  await git(root, "add", "package.json");
  await git(root, "commit", "-qm", "no verification script");
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({ cwd: root, baseline });
  assert.equal(receipt.verdict, "UNPROVEN");
  assert.match(receipt.unverified_dimensions.join("\n"), /No repository-defined/);
});

test("command timeout is bounded and UNPROVEN", async () => {
  const root = await fixture('node -e "setTimeout(()=>{},5000)"');
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
    timeoutMs: 50,
  });
  assert.equal(receipt.verdict, "UNPROVEN");
  assert.equal(receipt.verification_commands[0]?.timed_out, true);
  assert.ok((receipt.verification_commands[0]?.duration_ms ?? 9999) < 2000);
});

test("cancellation stops the command and is UNPROVEN", async () => {
  const root = await fixture('node -e "setTimeout(()=>{},5000)"');
  const baseline = await editAfterBaseline(root);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 50);
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
    signal: controller.signal,
    timeoutMs: 5000,
  });
  assert.equal(receipt.verdict, "UNPROVEN");
  assert.equal(receipt.verification_commands[0]?.cancelled, true);
});

test("malformed config does not crash and is UNPROVEN", async () => {
  const root = await fixture();
  await writeFile(join(root, "package.json"), "{not valid json");
  await git(root, "add", "package.json");
  await git(root, "commit", "-qm", "malformed config");
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({ cwd: root, baseline });
  assert.equal(receipt.verdict, "UNPROVEN");
  assert.match(receipt.warnings.join("\n"), /Malformed package.json/);
});

test("no git repository returns a bounded UNPROVEN receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-no-git-"));
  fixtures.push(root);
  const receipt = await verifyRepository({ cwd: root });
  assert.equal(receipt.verdict, "UNPROVEN");
  assert.equal(receipt.repository_root, null);
  assert.equal(receipt.baseline, null);
});

test("Python, Rust, Go, and Node lockfile discovery uses deterministic commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-discovery-"));
  fixtures.push(root);
  await writeFile(
    join(root, "pyproject.toml"),
    "[tool.pytest.ini_options]\naddopts = '-q'\n",
  );
  assert.deepEqual((await discoverVerification(root)).commands[0]?.command, [
    "python3",
    "-m",
    "pytest",
  ]);
  assert.equal((await discoverVerification(root)).commands[0]?.narrowing, "safe");
  await rm(join(root, "pyproject.toml"));
  await writeFile(
    join(root, "Cargo.toml"),
    "[package]\nname='fixture'\nversion='0.1.0'\n",
  );
  assert.deepEqual((await discoverVerification(root)).commands[0]?.command, [
    "cargo",
    "test",
  ]);
  assert.equal((await discoverVerification(root)).commands[0]?.narrowing, "unverified");
  assert.equal(
    (await discoverVerification(root)).commands[0]?.command.join(" "),
    "cargo test",
  );
  await rm(join(root, "Cargo.toml"));
  await writeFile(join(root, "go.mod"), "module example.invalid/fixture\n\ngo 1.22\n");
  assert.deepEqual((await discoverVerification(root)).commands[0]?.command, [
    "go",
    "test",
    "./...",
  ]);
  assert.equal((await discoverVerification(root)).commands[0]?.narrowing, "safe");
  await rm(join(root, "go.mod"));
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { test: "node test.js" } }),
  );
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  assert.deepEqual((await discoverVerification(root)).commands[0]?.command, [
    "pnpm",
    "run",
    "test",
  ]);
  assert.equal((await discoverVerification(root)).commands[0]?.narrowing, "safe");
});

test("command output is truncated at the configured bound", async () => {
  const root = await fixture("node -e \"process.stdout.write('x'.repeat(10000))\"");
  const baseline = await editAfterBaseline(root);
  const receipt = await verifyRepository({
    cwd: root,
    baseline,
    maxOutputBytes: 256,
  });
  const result = receipt.verification_commands[0];
  assert.equal(receipt.verdict, "PASS");
  assert.equal(result?.stdout_truncated, true);
  assert.ok((result?.stdout.length ?? 9999) <= 256);
  assert.match(result?.stdout ?? "", /output truncated/);
});
