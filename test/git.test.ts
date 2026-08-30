import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { captureGitDiffStat } from "../src/core/git.js";

const execFileAsync = promisify(execFile);
const fixtures: string[] = [];

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: root });
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pi-verity-git-"));
  fixtures.push(root);
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "proof@example.invalid");
  await git(root, "config", "user.name", "Proof Fixture");
  await writeFile(join(root, "source.js"), "one\ntwo\n");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "fixture");
  return root;
}

test.after(async () => {
  await Promise.all(fixtures.map((root) => rm(root, { recursive: true, force: true })));
});

test("captures staged, unstaged, untracked, and binary changes", async () => {
  const root = await fixture();
  await writeFile(join(root, "source.js"), "one\ntwo\nthree\n");
  await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 3]));
  await writeFile(join(root, "untracked.txt"), "new\nfile\n");
  await git(root, "add", "source.js");

  assert.deepEqual(await captureGitDiffStat(root), {
    files: 3,
    added: 3,
    removed: 0,
    primaryPath: "binary.bin",
  });
});

test("counts unstaged edits and removals", async () => {
  const root = await fixture();
  await writeFile(join(root, "source.js"), "one\n");

  assert.deepEqual(await captureGitDiffStat(root), {
    files: 1,
    added: 0,
    removed: 1,
    primaryPath: "source.js",
  });
});

test("returns an empty stat for a clean repository", async () => {
  const root = await fixture();

  assert.deepEqual(await captureGitDiffStat(root), {
    files: 0,
    added: 0,
    removed: 0,
    primaryPath: null,
  });
});
