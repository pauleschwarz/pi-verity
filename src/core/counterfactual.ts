import { cp, lstat, mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { type RunOptions, runCommand } from "./process.js";
import type {
  AntiGamingSignal,
  CommandResult,
  CounterfactualClassification,
  CounterfactualEvidence,
  PatchPolarity,
  VerificationCommand,
} from "./types.js";
import { type CounterfactualBaseline, createIsolatedWorkspace } from "./workspace.js";

const TEST_PATH =
  /(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)|(?:\.(?:test|spec)\.[^/]+|_test\.go|test_[^/]+\.py|tests?\.rs)$/i;

export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path);
}
/**
 * Shared mechanical detectors. Exported so the test-delta summary reuses this
 * single engine instead of maintaining a parallel set of rules.
 */
export const SKIP =
  /\b(?:it|test|describe)\.skip\s*\(|\b(?:xit|xtest)\s*\(|@pytest\.mark\.skip\b|#\[ignore\]|\bt\.Skip\s*\(/g;
export const ASSERTION =
  /\b(?:expect|assert(?:Equal|True|False|Raises)?|assert\.|should\.|require\.|t\.(?:Error|Fatal))\s*\(?/g;
export const SUPPRESSION =
  /(?:eslint-disable|@ts-ignore|@ts-nocheck|type:\s*ignore|noqa|pragma:\s*no cover|coverage:\s*ignore|#\[allow\()/g;
const UNCONDITIONAL =
  /\b(?:assert\s+true|expect\s*\(\s*true\s*\)\.toBe\s*\(\s*true\s*\)|pass\s*(?:#.*)?$|return\s*;?\s*$)/gim;
const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "coverage",
  ".receipts",
]);

export interface CounterfactualOptions {
  root: string;
  baseline: CounterfactualBaseline;
  command: VerificationCommand | undefined;
  timeoutMs: number;
  maxOutputBytes: number;
  maxWorkspaceBytes: number;
  allowNetwork: boolean;
  signal?: AbortSignal;
}

async function filesUnder(root: string, current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, absolute)));
    else if (entry.isFile() || entry.isSymbolicLink())
      files.push(relative(root, absolute).split(sep).join("/"));
  }
  return files;
}

async function text(path: string): Promise<string | null> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile()) return null;
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function count(pattern: RegExp, value: string): number {
  return [...value.matchAll(pattern)].length;
}

function antiGaming(
  file: string,
  before: string | null,
  after: string | null,
): AntiGamingSignal[] {
  if (before !== null && after === null)
    return [
      {
        kind: "TEST_DELETED",
        file,
        detail: "Previously present test file was deleted",
      },
    ];
  if (before === null || after === null) return [];
  const signals: AntiGamingSignal[] = [];
  if (count(SKIP, after) > count(SKIP, before))
    signals.push({
      kind: "TEST_SKIPPED",
      file,
      detail: "Active test changed to skipped or ignored",
    });
  if (count(ASSERTION, after) < count(ASSERTION, before))
    signals.push({
      kind: "ASSERTION_REMOVED",
      file,
      detail: "Assertion count decreased",
    });
  if (count(SUPPRESSION, after) > count(SUPPRESSION, before))
    signals.push({
      kind: "SUPPRESSION_INTRODUCED",
      file,
      detail: "Broad ignore or suppression was introduced",
    });
  if (
    count(UNCONDITIONAL, after) > count(UNCONDITIONAL, before) &&
    count(ASSERTION, after) < count(ASSERTION, before)
  ) {
    signals.push({
      kind: "UNCONDITIONAL_SUCCESS",
      file,
      detail: "Expected behavior was replaced by unconditional success",
    });
  }
  return signals;
}

function narrow(
  command: VerificationCommand,
  testFiles: string[],
): VerificationCommand {
  if (command.narrowing !== "safe") return command;
  if (command.source === "package.json")
    return { ...command, command: [...command.command, "--", ...testFiles] };
  if (command.source === "pyproject.toml")
    return { ...command, command: [...command.command, ...testFiles] };
  if (command.source === "go.mod") {
    const packages = [...new Set(testFiles.map((file) => `./${dirname(file)}`))];
    return { ...command, command: ["go", "test", ...packages] };
  }
  return command;
}

export function patchPolarity(
  classification: CounterfactualClassification,
): PatchPolarity {
  if (classification === "PROVEN_REGRESSION") return "PROVEN";
  if (classification === "NON_DISCRIMINATING_TEST") return "NON_DISCRIMINATING";
  return "UNDETERMINED";
}

function hasStructuralBaselineFailure(result: CommandResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return [
    /ERR_MODULE_NOT_FOUND/,
    /Cannot find module/i,
    /does not provide an export named/i,
    /has no exported member/i,
    /ModuleNotFoundError/,
    /cannot import name/i,
    /unresolved import/i,
    /error\[E043[23]\]/,
    /cannot find (?:function|value|type|module|crate)\b/i,
    /undefined: [A-Za-z_$][\w$]*/,
  ].some((pattern) => pattern.test(output));
}

function resultClassification(
  baseline: CommandResult,
  candidate: CommandResult,
): Pick<CounterfactualEvidence, "classification" | "diagnosis"> {
  if (
    baseline.cancelled ||
    candidate.cancelled ||
    baseline.timed_out ||
    candidate.timed_out
  ) {
    return {
      classification: "INCONCLUSIVE",
      diagnosis: "Counterfactual execution did not complete within its bounds",
    };
  }
  if (candidate.exit_code !== 0)
    return {
      classification: "CANDIDATE_FAILS",
      diagnosis: "Candidate implementation does not pass the candidate test",
    };
  if (baseline.exit_code === 0)
    return {
      classification: "NON_DISCRIMINATING_TEST",
      diagnosis:
        "Candidate test passes against both baseline and candidate implementations",
    };
  if (hasStructuralBaselineFailure(baseline))
    return {
      classification: "TEST_NOT_PORTABLE",
      diagnosis:
        "Candidate test cannot execute on the baseline because it references candidate-only code",
    };
  return {
    classification: "PROVEN_REGRESSION",
    diagnosis: "Candidate test is RED on baseline and GREEN on candidate",
  };
}

function networkPolicy(
  options: CounterfactualOptions,
): CounterfactualEvidence["network_policy"] {
  if (options.allowNetwork) return "explicitly_allowed";
  return process.platform === "darwin" ? "denied" : "unavailable";
}

export async function runCounterfactual(
  options: CounterfactualOptions,
): Promise<CounterfactualEvidence | null> {
  const baselineEntries = await filesUnder(options.baseline.directory);
  const candidateEntries = await filesUnder(options.root);
  const baselineFiles = baselineEntries.filter(isTestPath);
  const candidateFiles = candidateEntries.filter(isTestPath);
  const allTests = [...new Set([...baselineFiles, ...candidateFiles])].sort(
    (left, right) => left.localeCompare(right),
  );
  const changedTests: string[] = [];
  const signals: AntiGamingSignal[] = [];
  for (const file of allTests) {
    const before = await text(join(options.baseline.directory, file));
    const after = await text(join(options.root, file));
    if (before !== after) changedTests.push(file);
    signals.push(...antiGaming(file, before, after));
  }
  const allEntries = [...new Set([...baselineEntries, ...candidateEntries])];
  const implementationFiles = allEntries.filter((file) => !isTestPath(file));
  const implementationChanges = await Promise.all(
    implementationFiles.map(async (file) => {
      const before = await text(join(options.baseline.directory, file));
      const after = await text(join(options.root, file));
      return before !== after;
    }),
  );
  const implementationChanged = implementationChanges.some(Boolean);
  const selectedTests = changedTests.length > 0 ? changedTests : candidateFiles;
  if (selectedTests.length === 0 && !implementationChanged) return null;

  const baseEvidence = {
    patch_polarity: "UNDETERMINED" as PatchPolarity,
    candidate_test_files: selectedTests.length > 0 ? selectedTests : candidateFiles,
    command: null,
    baseline_result: null,
    candidate_result: null,
    narrowing: options.command?.narrowing ?? "unverified",
    anti_gaming_signals: signals,
    network_policy: networkPolicy(options),
    workspace_bytes: options.baseline.size_bytes,
  };
  if (options.command === undefined || options.command.kind !== "test") {
    return {
      ...baseEvidence,
      classification: "TEST_NOT_PORTABLE",
      diagnosis: "No narrow test command is available",
    };
  }
  if (options.command.narrowing !== "safe") {
    return {
      ...baseEvidence,
      classification: "INCONCLUSIVE",
      diagnosis: "Test command narrowing could not be verified safely",
    };
  }
  if (!options.allowNetwork && process.platform !== "darwin") {
    return {
      ...baseEvidence,
      classification: "INCONCLUSIVE",
      diagnosis: "Network isolation is unavailable on this platform",
    };
  }
  const portable = selectedTests.filter((file) => candidateFiles.includes(file));
  if (portable.length === 0) {
    return {
      ...baseEvidence,
      classification: "TEST_NOT_PORTABLE",
      diagnosis: "Only deleted tests were detected",
    };
  }

  let candidateWorkspace:
    | Awaited<ReturnType<typeof createIsolatedWorkspace>>
    | undefined;
  try {
    for (const file of portable) {
      const source = join(options.root, file);
      const destination = join(options.baseline.directory, file);
      const sourceStat = await lstat(source);
      if (!sourceStat.isFile())
        return {
          ...baseEvidence,
          classification: "TEST_NOT_PORTABLE",
          diagnosis: `Test is not a regular file: ${file}`,
        };
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination);
    }
    candidateWorkspace = await createIsolatedWorkspace(
      options.root,
      options.maxWorkspaceBytes,
      "pi-verity-candidate-",
    );
    const command = narrow(options.command, portable);
    const runOptions: Omit<RunOptions, "cwd"> = {
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      denyNetwork: !options.allowNetwork,
    };
    if (options.signal !== undefined) runOptions.signal = options.signal;
    const baselineResult = await runCommand(command, {
      ...runOptions,
      cwd: options.baseline.directory,
    });
    const candidateResult = await runCommand(command, {
      ...runOptions,
      cwd: candidateWorkspace.directory,
    });
    const outcome = resultClassification(baselineResult, candidateResult);
    return {
      ...baseEvidence,
      ...outcome,
      patch_polarity: patchPolarity(outcome.classification),
      command: command.command,
      baseline_result: baselineResult,
      candidate_result: candidateResult,
      narrowing: command.narrowing,
      workspace_bytes: options.baseline.size_bytes + candidateWorkspace.size_bytes,
    };
  } catch (error) {
    return {
      ...baseEvidence,
      classification: "INCONCLUSIVE",
      diagnosis: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await candidateWorkspace?.cleanup();
  }
}
