export const SCHEMA_VERSION = 4 as const;

export type Verdict = "PASS" | "PASS_WITH_WARNINGS" | "FAIL" | "UNPROVEN";
export type ScopeSeverity = "FAIL" | "WARNING" | "INFORMATION";
export type ScopeSignalCode =
  | "SCOPE_DEPENDENCY_ADDED"
  | "SCOPE_LOCKFILE_CHANGED"
  | "SCOPE_TEST_DELETED"
  | "SCOPE_TEST_RENAMED"
  | "SCOPE_TEST_SKIPPED"
  | "SCOPE_LINT_SUPPRESSION_ADDED"
  | "SCOPE_TYPE_SUPPRESSION_ADDED"
  | "SCOPE_GENERATED_FILE_MODIFIED"
  | "SCOPE_PACKAGE_BUILD_CONFIG_MODIFIED"
  | "SCOPE_MIGRATION_MODIFIED"
  | "SCOPE_PUBLIC_API_CHANGED"
  | "SCOPE_SECRET_LIKE_FILE_ADDED"
  | "SCOPE_BINARY_ADDED"
  | "SCOPE_BROAD_FILE_SPREAD";

export interface ScopeSignal {
  severity: ScopeSeverity;
  code: ScopeSignalCode;
  file: string;
  observed: string;
  why: string;
  evidence: string[];
}

export interface ScopeIntegrityEvidence {
  available: boolean;
  baseline_source: "exact_workspace" | "git_commit" | "unavailable";
  analyzed_files: string[];
  task_touched: string[];
  signals: ScopeSignal[];
  reason: string | null;
}
export type PatchPolarity = "PROVEN" | "NON_DISCRIMINATING" | "UNDETERMINED";

export type CounterfactualClassification =
  | "PROVEN_REGRESSION"
  | "NON_DISCRIMINATING_TEST"
  | "BASELINE_UNAVAILABLE"
  | "TEST_NOT_PORTABLE"
  | "CANDIDATE_FAILS"
  | "INCONCLUSIVE";

export type AntiGamingSignalKind =
  | "TEST_SKIPPED"
  | "ASSERTION_REMOVED"
  | "TEST_DELETED"
  | "SUPPRESSION_INTRODUCED"
  | "UNCONDITIONAL_SUCCESS";

export interface AntiGamingSignal {
  kind: AntiGamingSignalKind;
  file: string;
  detail: string;
}

/**
 * Claim classes extracted deterministically from the user request. Kept
 * intentionally small: each kind must be falsifiable by a cheap sensor.
 */
export type ObservableClaimKind =
  | "EXACT_TEXT_PRESENT"
  | "EXACT_TEXT_ABSENT"
  | "STYLE_VALUE"
  | "VISIBILITY"
  | "NUMERIC_UI_VALUE"
  | "ROUTE_HINT";

/**
 * What the USER said should be true. Expected values are Verity-owned and can
 * never be supplied or altered by the agent.
 */
export interface ObservableClaim {
  id: string;
  kind: ObservableClaimKind;
  expected: string;
  target_description?: string;
  route_hint?: string;
}

/**
 * Where the AGENT suggests Verity should look. Location only: it carries no
 * expected value, no result and no verdict, by construction.
 */
export interface ProbeHint {
  claim_id: string;
  route?: string;
  selector?: string;
  file?: string;
}

export type EffectStatus =
  | "SOURCE_OBSERVED"
  | "RUNTIME_OBSERVED"
  | "UNCHECKED"
  | "SOURCE_CONTRADICTED"
  | "RUNTIME_CONTRADICTED";

export interface EffectObservation {
  claim_id: string;
  kind: ObservableClaimKind;
  expected: string;
  observed: string | null;
  status: EffectStatus;
}

export interface EffectEvidence {
  claims: EffectObservation[];
}

/**
 * Mechanical facts about how test evidence changed this turn. Facts only: no
 * quality judgement is expressed or implied.
 */
export interface TestDelta {
  available: boolean;
  files_added: number;
  files_modified: number;
  files_deleted: number;
  assertions_added: number;
  assertions_removed: number;
  skips_added: number;
  suppressions_added: number;
  weakened: boolean;
}

export interface GitSnapshot {
  sha: string | null;
  status_hash: string;
  state_hash: string;
  dirty: boolean;
  status_porcelain_v2: string;
}

export interface VerificationCommand {
  source: "package.json" | "pyproject.toml" | "Cargo.toml" | "go.mod";
  kind: "test" | "check" | "lint";
  command: string[];
  narrowing: "safe" | "unverified";
}

export interface CommandResult extends VerificationCommand {
  cwd: string;
  exit_code: number | null;
  duration_ms: number;
  stdout: string;
  stderr: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  timed_out: boolean;
  cancelled: boolean;
}

export interface CounterfactualEvidence {
  classification: CounterfactualClassification;
  patch_polarity: PatchPolarity;
  candidate_test_files: string[];
  command: string[] | null;
  baseline_result: CommandResult | null;
  candidate_result: CommandResult | null;
  narrowing: "safe" | "unverified";
  anti_gaming_signals: AntiGamingSignal[];
  network_policy: "denied" | "explicitly_allowed" | "unavailable";
  workspace_bytes: number;
  diagnosis: string;
}

export interface ProofReceipt {
  schema_version: typeof SCHEMA_VERSION;
  task_id: string | null;
  session_id: string | null;
  repository_root: string | null;
  created_at: string;
  baseline: GitSnapshot | null;
  final_diff_hash: string | null;
  changed_files: string[];
  repository_changed_since_baseline: boolean;
  verification_commands: CommandResult[];
  counterfactual: CounterfactualEvidence | null;
  scope_integrity: ScopeIntegrityEvidence;
  test_delta: TestDelta;
  effect_evidence: EffectEvidence;
  warnings: string[];
  unverified_dimensions: string[];
  verdict: Verdict;
}

export interface VerifyOptions {
  cwd: string;
  baseline?: GitSnapshot;
  taskId?: string;
  sessionId?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  maxWorkspaceBytes?: number;
  counterfactualBaseline?: import("./workspace.js").CounterfactualBaseline;
  observableClaims?: readonly ObservableClaim[];
  probeHints?: readonly ProbeHint[];
  allowCounterfactualNetwork?: boolean;
  signal?: AbortSignal;
  now?: () => Date;
}
