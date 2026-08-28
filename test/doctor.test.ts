import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatDoctorReport, runDoctor } from "../src/core/doctor.js";

const directories: string[] = [];
test.after(async () => {
  await Promise.all(
    directories.map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("doctor reports a ready Git repository without network or LLM dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-doctor-"));
  directories.push(root);
  await writeFile(join(root, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  const report = await runDoctor(root);
  assert.equal(report.ready, false);
  assert.equal(
    report.checks.find((item) => item.label === "not inside a Git repository")?.status,
    "ERROR",
  );
  assert.match(formatDoctorReport(report), /ERROR not inside a Git repository/);
});

test("doctor warns when typecheck is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-doctor-"));
  directories.push(root);
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("git", ["init", "-q"], { cwd: root });
  await writeFile(join(root, "package.json"), '{"scripts":{"test":"node --test"}}\n');
  const report = await runDoctor(root);
  assert.equal(report.ready, true);
  assert.equal(
    report.checks.find((item) => item.label.startsWith("no typecheck"))?.status,
    "WARN",
  );
  assert.match(formatDoctorReport(report), /WARN no typecheck command discovered/);
});

test("doctor reports a configured typecheck command", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-doctor-"));
  directories.push(root);
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("git", ["init", "-q"], { cwd: root });
  await writeFile(
    join(root, "package.json"),
    '{"scripts":{"test":"node --test","typecheck":"tsc --noEmit"}}\n',
  );
  const report = await runDoctor(root);
  assert.equal(report.ready, true);
  assert.equal(
    report.checks.find((item) => item.label.startsWith("typecheck:"))?.status,
    "OK",
  );
  assert.match(formatDoctorReport(report), /typecheck: npm run typecheck/);
});
