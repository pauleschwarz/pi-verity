import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadVisualQaEvidence } from "../src/core/external-evidence.js";
import { sha256 } from "../src/core/hash.js";
import { verifyRepository } from "../src/core/verifier.js";

const root = join(import.meta.dirname, "..");
const directories: string[] = [];

test.after(async () => {
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function writeReport(
  report: Record<string, unknown>,
): Promise<{ path: string; hash: string }> {
  const directory = await mkdtemp(join(tmpdir(), "verity-vqa-"));
  directories.push(directory);
  const path = join(directory, "report.json");
  const body = `${JSON.stringify(report)}\n`;
  await writeFile(path, body);
  return { path, hash: sha256(Buffer.from(body)) };
}

async function gitFixture(): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const fixture = await mkdtemp(join(tmpdir(), "verity-repo-"));
  directories.push(fixture);
  await execFileAsync("git", ["init", "-q"], { cwd: fixture });
  await execFileAsync("git", ["config", "user.email", "proof@example.invalid"], {
    cwd: fixture,
  });
  await execFileAsync("git", ["config", "user.name", "Proof Fixture"], {
    cwd: fixture,
  });
  await writeFile(join(fixture, "source.js"), "export const value = 1;\n");
  await execFileAsync("git", ["add", "."], { cwd: fixture });
  await execFileAsync("git", ["commit", "-qm", "fixture"], { cwd: fixture });
  return fixture;
}

test("missing visual-qa report is UNAVAILABLE", async () => {
  const evidence = await loadVisualQaEvidence({
    reportPath: join(tmpdir(), "verity-missing-report.json"),
  });
  assert.equal(evidence.status, "UNAVAILABLE");
  assert.equal(evidence.subject_bound, false);
  assert.equal(evidence.report_hash, null);
});

test("malformed visual-qa report is MALFORMED", async () => {
  const directory = await mkdtemp(join(tmpdir(), "verity-vqa-"));
  directories.push(directory);
  const path = join(directory, "report.json");
  await writeFile(path, "not-json");
  const evidence = await loadVisualQaEvidence({ reportPath: path });
  assert.equal(evidence.status, "MALFORMED");
  assert.equal(evidence.subject_bound, false);
});

test("incomplete visual-qa coverage is INCOMPLETE even if verdict says PASS", async () => {
  const { path } = await writeReport({
    verdict: "PASS",
    complete: false,
    run_id: "run-1",
    coverage: { limit_reason: "max_states" },
    issue_count: 0,
  });
  const evidence = await loadVisualQaEvidence({ reportPath: path, subjectBound: true });
  assert.equal(evidence.status, "INCOMPLETE");
  assert.equal(evidence.subject_bound, false);
  assert.match(evidence.detail, /max_states/);
});

test("unbound visual-qa PASS warns and cannot become PASS", async () => {
  const fixture = await gitFixture();
  const { path, hash } = await writeReport({
    verdict: "PASS",
    complete: true,
    run_id: "run-pass",
    issue_count: 0,
  });
  const receipt = await verifyRepository({
    cwd: fixture,
    externalEvidence: [await loadVisualQaEvidence({ reportPath: path })],
  });
  assert.equal(receipt.schema_version, 5);
  assert.equal(receipt.verdict, "PASS_WITH_WARNINGS");
  assert.equal(receipt.external_evidence[0]?.status, "PASS");
  assert.equal(receipt.external_evidence[0]?.subject_bound, false);
  assert.equal(receipt.external_evidence[0]?.report_hash, hash);
  assert.match(receipt.warnings.join("\n"), /without a bound subject/);
});

test("bound visual-qa PASS is recorded without inventing repository proof", async () => {
  const fixture = await gitFixture();
  const { path } = await writeReport({
    verdict: "PASS",
    complete: true,
    run_id: "run-bound",
    issue_count: 0,
  });
  const receipt = await verifyRepository({
    cwd: fixture,
    externalEvidence: [
      await loadVisualQaEvidence({ reportPath: path, subjectBound: true }),
    ],
  });
  assert.equal(receipt.verdict, "PASS");
  assert.equal(receipt.external_evidence[0]?.subject_bound, true);
  assert.deepEqual(receipt.unverified_dimensions, []);
});

test("visual-qa FAIL blocks even when repository checks would pass", async () => {
  const fixture = await gitFixture();
  const { path } = await writeReport({
    verdict: "FAIL",
    complete: true,
    run_id: "run-fail",
    issue_count: 2,
  });
  const receipt = await verifyRepository({
    cwd: fixture,
    externalEvidence: [await loadVisualQaEvidence({ reportPath: path })],
  });
  assert.equal(receipt.verdict, "FAIL");
  assert.equal(receipt.external_evidence[0]?.status, "FAIL");
});

test("missing or malformed visual-qa evidence is UNPROVEN", async () => {
  const fixture = await gitFixture();
  const missing = await verifyRepository({
    cwd: fixture,
    externalEvidence: [
      await loadVisualQaEvidence({ reportPath: join(fixture, "absent.json") }),
    ],
  });
  assert.equal(missing.verdict, "UNPROVEN");
  assert.match(missing.unverified_dimensions.join("\n"), /UNAVAILABLE/);

  const { path } = await writeReport({ verdict: "maybe" });
  const malformed = await verifyRepository({
    cwd: fixture,
    externalEvidence: [await loadVisualQaEvidence({ reportPath: path })],
  });
  assert.equal(malformed.verdict, "UNPROVEN");
  assert.match(malformed.unverified_dimensions.join("\n"), /MALFORMED/);
});

test("CLI requires --visual-qa-report before --visual-qa-subject-bound", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", "verify", "--visual-qa-subject-bound"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--visual-qa-subject-bound requires --visual-qa-report/);
});

test("core export surface stays harness-neutral", async () => {
  const source = await readFile(join(root, "src/core/index.ts"), "utf8");
  assert.match(source, /export \* from "\.\/external-evidence\.js"/);
  assert.doesNotMatch(source, /playwright/i);
  assert.doesNotMatch(source, /@mariozechner\/pi/);
});
