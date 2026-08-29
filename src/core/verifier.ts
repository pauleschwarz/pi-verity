import {
  type CounterfactualOptions,
  isTestPath,
  runCounterfactual,
} from "./counterfactual.js";
import { discoverVerification } from "./discovery.js";
import {
  captureGitSnapshot,
  changedFiles,
  findRepositoryRoot,
  NotGitRepositoryError,
} from "./git.js";
import { type RunOptions, runCommand } from "./process.js";
import {
  analyzeScopeIntegrity,
  type ScopeIntegrityOptions,
} from "./scope-integrity.js";
import {
  type CommandResult,
  type CounterfactualEvidence,
  type ProofReceipt,
  SCHEMA_VERSION,
  type ScopeIntegrityEvidence,
  type Verdict,
  type VerifyOptions,
} from "./types.js";
import { createIsolatedWorkspace, DEFAULT_MAX_WORKSPACE_BYTES } from "./workspace.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

async function analyzeRepositoryScope(
  root: string,
  files: string[],
  baseline: import("./types.js").GitSnapshot,
  baselineDirectory: string | undefined,
): Promise<ScopeIntegrityEvidence> {
  const scopeOptions: ScopeIntegrityOptions = {
    root,
    changedFiles: files,
    baselineDirty: baseline.dirty,
  };
  if (baselineDirectory !== undefined)
    scopeOptions.baselineDirectory = baselineDirectory;
  if (baseline.sha !== null) scopeOptions.baselineRef = baseline.sha;
  return analyzeScopeIntegrity(scopeOptions);
}

function unavailableCounterfactual(testFiles: string[]): CounterfactualEvidence {
  return {
    classification: "BASELINE_UNAVAILABLE",
    patch_polarity: "UNDETERMINED",
    candidate_test_files: testFiles,
    command: null,
    baseline_result: null,
    candidate_result: null,
    anti_gaming_signals: [],
    network_policy: "unavailable",
    workspace_bytes: 0,
    diagnosis: "An exact pre-change workspace was not captured",
  };
}

interface VerdictEvidence {
  changed: boolean;
  baselineDirty: boolean;
  commands: CommandResult[];
  counterfactual: CounterfactualEvidence | null;
  scopeIntegrity: ScopeIntegrityEvidence;
  warnings: string[];
  unverified: string[];
}

function decideVerdict(evidence: VerdictEvidence): Verdict {
  const {
    changed,
    baselineDirty,
    commands,
    counterfactual,
    scopeIntegrity,
    warnings,
    unverified,
  } = evidence;
  if (
    commands.some(
      (result) => result.exit_code !== 0 && !result.timed_out && !result.cancelled,
    )
  )
    return "FAIL";
  if (counterfactual?.classification === "CANDIDATE_FAILS") return "FAIL";
  if (scopeIntegrity.signals.some((item) => item.severity === "FAIL")) return "FAIL";
  if (
    commands.some((result) => result.cancelled || result.timed_out) ||
    unverified.length > 0
  )
    return "UNPROVEN";
  if (changed && commands.length === 0) return "UNPROVEN";
  if (
    baselineDirty ||
    warnings.length > 0 ||
    scopeIntegrity.signals.some((item) => item.severity === "WARNING")
  )
    return "PASS_WITH_WARNINGS";
  return "PASS";
}

async function runStandardVerification(
  root: string,
  commands: Awaited<ReturnType<typeof discoverVerification>>["commands"],
  options: VerifyOptions,
): Promise<CommandResult[]> {
  if (commands.length === 0) return [];
  const workspace = await createIsolatedWorkspace(
    root,
    options.maxWorkspaceBytes ?? DEFAULT_MAX_WORKSPACE_BYTES,
  );
  const results: CommandResult[] = [];
  try {
    for (const command of commands) {
      const runOptions: RunOptions = {
        cwd: workspace.directory,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      };
      if (options.signal !== undefined) runOptions.signal = options.signal;
      const result = await runCommand(command, runOptions);
      results.push(result);
      if (result.exit_code !== 0 || result.cancelled) break;
    }
    return results;
  } finally {
    await workspace.cleanup();
  }
}

function emptyReceipt(
  options: VerifyOptions,
  createdAt: string,
  error: NotGitRepositoryError,
): ProofReceipt {
  return {
    schema_version: SCHEMA_VERSION,
    task_id: options.taskId ?? null,
    session_id: options.sessionId ?? null,
    repository_root: null,
    created_at: createdAt,
    baseline: null,
    final_diff_hash: null,
    changed_files: [],
    repository_changed_since_baseline: false,
    verification_commands: [],
    counterfactual: null,
    scope_integrity: {
      available: false,
      baseline_source: "unavailable",
      analyzed_files: [],
      task_touched: [],
      signals: [],
      reason: error.message,
    },
    warnings: [error.message],
    unverified_dimensions: ["repository state", "automated verification"],
    verdict: "UNPROVEN",
  };
}

export async function verifyRepository(options: VerifyOptions): Promise<ProofReceipt> {
  const createdAt = (options.now ?? (() => new Date()))().toISOString();
  let root: string;
  try {
    root = await findRepositoryRoot(options.cwd);
  } catch (error) {
    if (!(error instanceof NotGitRepositoryError)) throw error;
    return emptyReceipt(options, createdAt, error);
  }

  const warnings: string[] = [];
  const unverified: string[] = [];
  const baseline = options.baseline ?? (await captureGitSnapshot(root));
  const final = await captureGitSnapshot(root);
  const gitChangedFiles = await changedFiles(root);
  const scopeIntegrity = await analyzeRepositoryScope(
    root,
    gitChangedFiles,
    baseline,
    options.counterfactualBaseline?.directory,
  );
  const files = [
    ...new Set([...gitChangedFiles, ...scopeIntegrity.analyzed_files]),
  ].sort((left, right) => left.localeCompare(right));
  const changed =
    baseline.state_hash !== final.state_hash ||
    scopeIntegrity.analyzed_files.length > 0;
  if (baseline.dirty)
    warnings.push(
      "Baseline working tree was dirty; pi-verity does not claim a clean baseline",
    );

  const discovery = await discoverVerification(root);
  warnings.push(...discovery.warnings);
  let results: CommandResult[] = [];
  if (changed && discovery.commands.length === 0) {
    unverified.push("No repository-defined verification command was discovered");
  } else if (changed) {
    try {
      results = await runStandardVerification(root, discovery.commands, options);
      for (const result of results) {
        if (result.timed_out)
          unverified.push(`Command timed out: ${result.command.join(" ")}`);
        if (result.cancelled)
          unverified.push(`Command cancelled: ${result.command.join(" ")}`);
      }
    } catch (error) {
      unverified.push(
        `Verification environment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let counterfactual: CounterfactualEvidence | null = null;
  const changedTests = files.filter(isTestPath);
  if (changedTests.length > 0 && options.counterfactualBaseline === undefined) {
    counterfactual = unavailableCounterfactual(changedTests);
  } else if (changed && options.counterfactualBaseline !== undefined) {
    const counterfactualOptions: CounterfactualOptions = {
      root,
      baseline: options.counterfactualBaseline,
      command: discovery.commands.find((command) => command.kind === "test"),
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      maxWorkspaceBytes: options.maxWorkspaceBytes ?? DEFAULT_MAX_WORKSPACE_BYTES,
      allowNetwork: options.allowCounterfactualNetwork ?? false,
    };
    if (options.signal !== undefined) counterfactualOptions.signal = options.signal;
    counterfactual = await runCounterfactual(counterfactualOptions);
  }

  if (
    counterfactual !== null &&
    counterfactual.classification !== "PROVEN_REGRESSION" &&
    counterfactual.classification !== "TEST_NOT_PORTABLE"
  ) {
    unverified.push(`Counterfactual verification: ${counterfactual.classification}`);
  }
  if ((counterfactual?.anti_gaming_signals.length ?? 0) > 0) {
    unverified.push("High-confidence suspicious test weakening detected");
  }

  const receipt: ProofReceipt = {
    schema_version: SCHEMA_VERSION,
    task_id: options.taskId ?? null,
    session_id: options.sessionId ?? null,
    repository_root: root,
    created_at: createdAt,
    baseline,
    final_diff_hash: final.state_hash,
    changed_files: files,
    repository_changed_since_baseline: changed,
    verification_commands: results,
    counterfactual,
    scope_integrity: scopeIntegrity,
    warnings,
    unverified_dimensions: unverified,
    verdict: decideVerdict({
      changed,
      baselineDirty: baseline.dirty,
      commands: results,
      counterfactual,
      scopeIntegrity,
      warnings,
      unverified,
    }),
  };
  await options.counterfactualBaseline?.cleanup();
  return receipt;
}
