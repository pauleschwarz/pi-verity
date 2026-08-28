import { execFile } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { canonicalJson, sha256 } from "./hash.js";
import type { GitSnapshot } from "./types.js";

const execFileAsync = promisify(execFile);

export class NotGitRepositoryError extends Error {
  constructor(cwd: string) {
    super(`Not a git repository: ${cwd}`);
    this.name = "NotGitRepositoryError";
  }
}

async function git(cwd: string, args: string[]): Promise<Buffer> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
  });
  return result.stdout;
}

export async function findRepositoryRoot(cwd: string): Promise<string> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).toString("utf8").trim();
  } catch {
    throw new NotGitRepositoryError(cwd);
  }
}

function fieldRemainder(record: string, separators: number): string {
  let offset = -1;
  for (let count = 0; count < separators; count += 1) {
    offset = record.indexOf(" ", offset + 1);
    if (offset < 0) return "";
  }
  return record.slice(offset + 1);
}

function statusPaths(status: Buffer): string[] {
  const records = status.toString("utf8").split("\0");
  const paths: string[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("? ")) paths.push(record.slice(2));
    else if (record.startsWith("1 ")) paths.push(fieldRemainder(record, 8));
    else if (record.startsWith("u ")) paths.push(fieldRemainder(record, 10));
    else if (record.startsWith("2 ")) {
      paths.push(fieldRemainder(record, 9));
      index += 1; // original path is the next NUL record
    }
  }
  return [...new Set(paths.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

async function pathState(root: string, path: string): Promise<[string, string]> {
  const absolute = join(root, path);
  try {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) return [path, `symlink:${await readlink(absolute)}`];
    if (!stat.isFile()) return [path, `mode:${stat.mode}:non-file`];
    return [path, `${stat.mode}:${sha256(await readFile(absolute))}`];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [path, "deleted"];
    throw error;
  }
}

export async function captureGitSnapshot(root: string): Promise<GitSnapshot> {
  const status = await git(root, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all",
  ]);
  let sha: string | null = null;
  try {
    sha = (await git(root, ["rev-parse", "--verify", "HEAD"])).toString("utf8").trim();
  } catch {
    /* unborn repository */
  }
  const states = await Promise.all(
    statusPaths(status).map((path) => pathState(root, path)),
  );
  const statusText = status.toString("utf8");
  return {
    sha,
    status_hash: sha256(status),
    state_hash: sha256(canonicalJson({ sha, status: statusText, states })),
    dirty: status.length > 0,
    status_porcelain_v2:
      status.length <= 65_536
        ? statusText
        : `${statusText.slice(0, 32_768)}\n... status truncated ...\n${statusText.slice(-32_768)}`,
  };
}

export async function changedFiles(root: string): Promise<string[]> {
  return statusPaths(
    await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]),
  );
}
