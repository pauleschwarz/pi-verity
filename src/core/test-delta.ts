import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { ASSERTION, count, isTestPath, SKIP, SUPPRESSION } from "./counterfactual.js";
import type { TestDelta } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface TestDeltaOptions {
  root: string;
  changedFiles: readonly string[];
  /** Exact pre-change workspace, when one was captured. Preferred baseline. */
  baselineDirectory?: string;
  /** Clean Git baseline reference, used when no workspace copy exists. */
  baselineRef?: string;
  baselineDirty?: boolean;
}

export const EMPTY_TEST_DELTA: TestDelta = {
  available: false,
  files_added: 0,
  files_modified: 0,
  files_deleted: 0,
  assertions_added: 0,
  assertions_removed: 0,
  skips_added: 0,
  suppressions_added: 0,
  weakened: false,
};

async function diskText(path: string): Promise<string | null> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function gitText(
  root: string,
  ref: string,
  path: string,
): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["show", `${ref}:${path}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: MAX_FILE_BYTES,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    });
    return result.stdout;
  } catch {
    return null;
  }
}

/**
 * Mechanical summary of how test evidence changed this turn.
 *
 * Reports facts only. It never claims a test became "better" or "worse"; it
 * reports that assertions were added or removed, and marks `weakened` when the
 * change strictly reduced mechanical evidence.
 */
export async function summarizeTestDelta(
  options: TestDeltaOptions,
): Promise<TestDelta> {
  const testFiles = options.changedFiles.filter(isTestPath);
  const usable =
    options.baselineDirectory !== undefined ||
    (options.baselineRef !== undefined && options.baselineDirty !== true);
  if (!usable) return { ...EMPTY_TEST_DELTA };
  if (testFiles.length === 0) return { ...EMPTY_TEST_DELTA, available: true };

  const delta: TestDelta = { ...EMPTY_TEST_DELTA, available: true };
  for (const path of testFiles) {
    const before =
      options.baselineDirectory !== undefined
        ? await diskText(join(options.baselineDirectory, path))
        : await gitText(options.root, options.baselineRef ?? "HEAD", path);
    const after = await diskText(join(options.root, path));

    if (before === null && after === null) continue;
    if (before === null) {
      delta.files_added += 1;
      if (after !== null) delta.assertions_added += count(ASSERTION, after);
      continue;
    }
    if (after === null) {
      delta.files_deleted += 1;
      delta.assertions_removed += count(ASSERTION, before);
      continue;
    }
    if (before === after) continue;

    delta.files_modified += 1;
    const assertionsBefore = count(ASSERTION, before);
    const assertionsAfter = count(ASSERTION, after);
    if (assertionsAfter >= assertionsBefore)
      delta.assertions_added += assertionsAfter - assertionsBefore;
    else delta.assertions_removed += assertionsBefore - assertionsAfter;
    delta.skips_added += Math.max(0, count(SKIP, after) - count(SKIP, before));
    delta.suppressions_added += Math.max(
      0,
      count(SUPPRESSION, after) - count(SUPPRESSION, before),
    );
  }

  delta.weakened =
    delta.assertions_removed > 0 ||
    delta.skips_added > 0 ||
    delta.suppressions_added > 0 ||
    delta.files_deleted > 0;
  return delta;
}

/** Compact, factual rendering. Empty string when there is nothing to report. */
export function formatTestDelta(delta: TestDelta): string {
  if (!delta.available) return "";
  const parts: string[] = [];
  if (delta.files_added > 0) parts.push(`${delta.files_added} added`);
  if (delta.files_modified > 0) parts.push(`${delta.files_modified} modified`);
  if (delta.files_deleted > 0) parts.push(`${delta.files_deleted} deleted`);
  if (parts.length === 0) return "";
  return [
    parts.join(" · "),
    `+${delta.assertions_added} assertions`,
    `-${delta.assertions_removed} removed`,
    `${delta.skips_added} skipped`,
  ].join(" · ");
}
