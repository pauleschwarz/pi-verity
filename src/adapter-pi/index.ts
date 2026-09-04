import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { formatDoctorReport, runDoctor } from "../core/doctor.js";
import { EMPTY_EFFECT_EVIDENCE, proveEffects } from "../core/effect-proof.js";
import {
  EXECUTION_POLICY_ENV,
  type ExecutionPolicyDecision,
  type ExecutionPolicyEvent,
  fingerprintExecutionRequest,
  formatExecutionPolicyEvent,
  lockExecutionInput,
  parseExecutionPolicy,
  requiresExecutionApproval,
  summarizeExecutionRequest,
} from "../core/execution-policy.js";
import {
  captureGitDiffStat,
  captureGitSnapshot,
  findRepositoryRoot,
  type GitDiffStat,
} from "../core/git.js";
import { canonicalJson, sha256 } from "../core/hash.js";
import { writeReceipt } from "../core/receipt.js";
import { formatTestDelta } from "../core/test-delta.js";
import {
  addProbeHint,
  createTurnContract,
  renderContractContext,
  type TurnContract,
} from "../core/turn-contract.js";
import type {
  CommandResult,
  GitSnapshot,
  ProbeHint,
  ProofReceipt,
  VerifyOptions,
} from "../core/types.js";
import { verifyRepository } from "../core/verifier.js";
import {
  type CounterfactualBaseline,
  captureCounterfactualBaseline,
} from "../core/workspace.js";

type VerityUiStateKind =
  | "BLOCKED"
  | "FAILED"
  | "APPROVAL_REQUIRED"
  | "VERIFYING"
  | "UNPROVEN"
  | "WARNING"
  | "PROVEN"
  | "CHANGE_PENDING"
  | "OBSERVING";

export interface VerityUiState {
  kind: VerityUiStateKind;
  detail?: string;
}

type VerityThemeColor = "accent" | "success" | "warning" | "error" | "dim";

interface VerityTheme {
  fg: (color: VerityThemeColor, text: string) => string;
}

const VERITY_STATE_PRIORITY: Record<VerityUiStateKind, number> = {
  BLOCKED: 9,
  FAILED: 8,
  APPROVAL_REQUIRED: 7,
  VERIFYING: 6,
  UNPROVEN: 5,
  WARNING: 4,
  PROVEN: 3,
  CHANGE_PENDING: 2,
  OBSERVING: 1,
};

const VERITY_STATE_LABEL: Record<VerityUiStateKind, string> = {
  BLOCKED: "blocked",
  FAILED: "failed",
  APPROVAL_REQUIRED: "approval required",
  VERIFYING: "verifying",
  UNPROVEN: "unproven",
  WARNING: "warning",
  PROVEN: "proven",
  CHANGE_PENDING: "change pending",
  OBSERVING: "observing",
};

const VERITY_STATE_COLOR: Record<VerityUiStateKind, VerityThemeColor> = {
  BLOCKED: "error",
  FAILED: "error",
  APPROVAL_REQUIRED: "warning",
  VERIFYING: "accent",
  UNPROVEN: "warning",
  WARNING: "warning",
  PROVEN: "success",
  CHANGE_PENDING: "accent",
  OBSERVING: "dim",
};

export function transitionVerityStatus(
  current: VerityUiState | undefined,
  next: VerityUiState,
  recover = false,
): VerityUiState {
  if (
    recover ||
    current === undefined ||
    VERITY_STATE_PRIORITY[next.kind] >= VERITY_STATE_PRIORITY[current.kind]
  ) {
    return next;
  }
  return current;
}

export function renderVerityStatus(state: VerityUiState, theme?: VerityTheme): string {
  const detail = state.detail?.replace(/\s+/g, " ").trim();
  const label =
    detail === undefined || detail.length === 0
      ? VERITY_STATE_LABEL[state.kind]
      : `${VERITY_STATE_LABEL[state.kind]} · ${detail.slice(0, 120)}`;
  const prefix = theme === undefined ? "verity" : theme.fg("dim", "verity");
  const value =
    theme === undefined ? label : theme.fg(VERITY_STATE_COLOR[state.kind], label);
  return `${prefix} · ${value}`;
}

export function setVerityStatus(context: PiContext, state: VerityUiState): void {
  context.ui?.setStatus?.("pi-verity", renderVerityStatus(state, context.ui.theme));
}

interface PiContext {
  cwd?: string;
  hasUI?: boolean;
  sessionManager?: { getSessionId?: () => string };
  ui?: {
    confirm?: (title: string, message: string) => Promise<boolean>;
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
    select?: (title: string, options: string[]) => Promise<string | undefined>;
    setStatus?: (key: string, value: string | undefined) => void;
    theme?: VerityTheme;
  };
}

interface PiEvent {
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  text?: string;
  prompt?: string;
}

interface PiToolCallResult {
  block: true;
  reason: string;
  terminate: true;
}

interface PiToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
}

interface PiToolSchema {
  type: string;
  additionalProperties?: boolean;
  properties?: Record<string, PiToolSchema>;
  items?: PiToolSchema;
  required?: string[];
}

type PiToolExecute = (
  toolCallId: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
  onUpdate?: (update: unknown) => void,
  ctx?: unknown,
) => Promise<PiToolResult>;

interface PiToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: PiToolSchema;
  execute: PiToolExecute;
}

interface PiApi {
  on: (
    event: string,
    handler: (event: PiEvent, context: PiContext) => Promise<unknown> | unknown,
  ) => void;
  appendEntry: (customType: string, data?: unknown) => void;
  sendMessage: (
    message: {
      customType: string;
      content: string;
      display?: boolean;
      details?: unknown;
    },
    options?: {
      triggerTurn?: boolean;
      deliverAs?: "steer" | "followUp" | "nextTurn";
    },
  ) => void;
  registerCommand: (
    name: string,
    definition: {
      description: string;
      handler: (args: string, context: PiContext) => Promise<void>;
    },
  ) => void;
  registerTool?: <TParams>(tool: PiToolDefinition & { parameters: TParams }) => void;
}

type NoticeLevel = "error" | "warning" | "info";
type ProofSubcommand =
  | "current"
  | "run"
  | "why"
  | "receipt"
  | "doctor"
  | "policy"
  | "invalid";

/**
 * Observation read-only set. Deliberately narrower than the execution-policy
 * approval set: anything unknown counts as mutating, and Verity's own check
 * tool must never flag the turn it belongs to.
 */
const OBSERVATION_READ_ONLY = new Set(["read", "grep", "find", "ls", "verity_check"]);

function receiptLevel(verdict: ProofReceipt["verdict"]): NoticeLevel {
  if (verdict === "FAIL") return "error";
  if (verdict === "UNPROVEN" || verdict === "PASS_WITH_WARNINGS") {
    return "warning";
  }
  return "info";
}

function taskId(sessionId: string | undefined, sequence: number): string {
  if (sessionId === undefined) return `turn-${sequence}`;
  return `${sessionId}:turn-${sequence}`;
}

export function configuredRepairLimit(
  value = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS,
): number {
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 0;
  return Math.min(parsed, 10);
}

function repairStatus(): string {
  const limit = configuredRepairLimit();
  return limit === 0
    ? "automatic repair: disabled"
    : `automatic repair: enabled (limit ${limit})`;
}

function commandLabel(result: CommandResult): string {
  return result.command.join(" ");
}

function commandOutcome(result: CommandResult): string {
  if (result.cancelled) return "cancelled";
  if (result.timed_out) return "timed out";
  if (result.exit_code === 0) return "PASS";
  return `FAIL (exit ${result.exit_code ?? "unknown"})`;
}

function receiptDuration(receipt: ProofReceipt): number {
  const standard = receipt.verification_commands.reduce(
    (total, result) => total + result.duration_ms,
    0,
  );
  const counterfactual = receipt.counterfactual;
  return (
    standard +
    (counterfactual?.baseline_result?.duration_ms ?? 0) +
    (counterfactual?.candidate_result?.duration_ms ?? 0)
  );
}

function formatDiffFacts(receipt: ProofReceipt, diff?: GitDiffStat | null): string {
  const files = diff?.files ?? receipt.changed_files.length;
  const added = diff?.added;
  const removed = diff?.removed;
  const counts =
    added !== undefined && removed !== undefined
      ? `${files} file${files === 1 ? "" : "s"} +${added}/-${removed}`
      : `${files} file${files === 1 ? "" : "s"}`;
  const ms = Math.max(0, Math.round(receiptDuration(receipt)));
  return `${counts} · ${ms}ms`;
}

function summaryDiagnostics(receipt: ProofReceipt): string[] {
  const failedCommands = receipt.verification_commands.flatMap((result) =>
    result.exit_code !== 0 && !result.timed_out && !result.cancelled
      ? [`${commandLabel(result)} failed`]
      : [],
  );
  const counterfactualFailure =
    receipt.counterfactual?.classification === "CANDIDATE_FAILS"
      ? [receipt.counterfactual.diagnosis]
      : [];
  const signalDetails = receipt.scope_integrity.signals.flatMap((signal) =>
    signal.severity === "INFORMATION" ? [] : [signal.observed],
  );
  const effectDetails = receipt.effect_evidence.claims.flatMap((claim) =>
    claim.status === "SOURCE_CONTRADICTED" ||
    claim.status === "RUNTIME_CONTRADICTED" ||
    claim.status === "UNCHECKED"
      ? [`${claim.claim_id} ${claim.status}`]
      : [],
  );
  const delta =
    receipt.test_delta.available && receipt.test_delta.weakened
      ? ["test evidence weakened"]
      : [];
  return [
    ...failedCommands,
    ...counterfactualFailure,
    ...signalDetails,
    ...effectDetails,
    ...delta,
    ...receipt.warnings,
    ...receipt.unverified_dimensions,
  ].slice(0, 3);
}

export function formatReceiptSummary(
  receipt: ProofReceipt,
  diff?: GitDiffStat | null,
): string {
  const facts = formatDiffFacts(receipt, diff);
  if (receipt.verdict === "PASS") {
    return `verity ✓ PASS · ${facts}`;
  }
  if (receipt.verdict === "PASS_WITH_WARNINGS") {
    const details = summaryDiagnostics(receipt);
    const suffix = details.length === 0 ? "" : `\n${details.join("\n")}`;
    return `verity ⚠ PASS_WITH_WARNINGS · ${facts}${suffix}`;
  }

  const marker = receipt.verdict === "FAIL" ? "✗" : "⚠";
  const primary =
    diff?.primaryPath ??
    receipt.changed_files.slice().sort((a, b) => a.localeCompare(b))[0];
  const head =
    primary === undefined
      ? `verity ${marker} ${receipt.verdict} · ${facts}`
      : `verity ${marker} ${receipt.verdict} · ${primary}`;
  const details = summaryDiagnostics(receipt);
  const body = details.length === 0 ? "" : `\n${details.join("\n")}`;
  return `${head}${body}\n/verity why`;
}

export function explainReceipt(receipt: ProofReceipt): string {
  const lines = [`verity ${receipt.verdict}`];
  if (receipt.verification_commands.length === 0) {
    lines.push(
      "check · unavailable · no supported safe verification command was selected",
    );
  } else {
    for (const result of receipt.verification_commands) {
      lines.push(
        `check · ${commandLabel(result)} · selected from ${result.source} (${result.kind}) · ${commandOutcome(result)}`,
      );
    }
  }

  if (receipt.counterfactual === null) {
    lines.push("counterfactual · not selected · no changed test required it");
  } else {
    lines.push(
      `counterfactual · ${receipt.counterfactual.classification} · ${receipt.counterfactual.diagnosis}`,
    );
    lines.push(`PATCH_POLARITY = ${receipt.counterfactual.patch_polarity}`);
  }

  const scope = receipt.scope_integrity;
  const scopeSelection = scope.available ? "selected" : "unavailable";
  const scopeReason = scope.reason === null ? "" : ` · ${scope.reason}`;
  lines.push(
    `scope integrity · ${scopeSelection} · baseline ${scope.baseline_source}${scopeReason}`,
  );
  for (const signal of scope.signals) {
    lines.push(
      `${signal.severity} ${signal.code} · ${signal.file} · ${signal.observed} · ${signal.why}`,
    );
    for (const evidence of signal.evidence) {
      lines.push(`  evidence · ${evidence}`);
    }
  }
  const delta = formatTestDelta(receipt.test_delta);
  if (delta.length > 0) lines.push(`test delta · ${delta}`);
  else if (receipt.test_delta.available)
    lines.push("test delta · available · no mechanical change");
  else lines.push("test delta · unavailable");
  if (receipt.effect_evidence.claims.length === 0) {
    lines.push("effect · no observable claims");
  } else {
    for (const claim of receipt.effect_evidence.claims) {
      const where = claim.observed === null ? "—" : claim.observed;
      lines.push(
        `effect · ${claim.claim_id} · ${claim.kind} · ${claim.status} · expected ${claim.expected} · observed ${where}`,
      );
    }
  }
  for (const warning of receipt.warnings) lines.push(`warning · ${warning}`);
  for (const dimension of receipt.unverified_dimensions) {
    lines.push(`unverified · ${dimension}`);
  }
  return lines.join("\n");
}

function boundedOutput(result: CommandResult): string | undefined {
  const output = (result.stderr || result.stdout).trim();
  if (output.length === 0) return undefined;
  const tail = output.slice(-800);
  return tail.replace(
    /((?:token|password|secret|api[_-]?key)\s*[=:]\s*)\S+/gi,
    "$1[REDACTED]",
  );
}

export function receiptMatchesState(
  receipt: ProofReceipt,
  current: GitSnapshot,
): boolean {
  return receipt.final_diff_hash === current.state_hash;
}

function receiptUiState(receipt: ProofReceipt): VerityUiState {
  // Detail-free labels: the footer renders every extension status on one
  // shared line, so Verity keeps the shortest text that stays unambiguous.
  if (receipt.verdict === "FAIL") return { kind: "FAILED" };
  if (receipt.verdict === "UNPROVEN") return { kind: "UNPROVEN" };
  if (receipt.verdict === "PASS_WITH_WARNINGS") return { kind: "WARNING" };
  return { kind: "PROVEN" };
}

export function minimalFailureEvidence(receipt: ProofReceipt): string {
  const lines = ["verity deterministic failure:"];
  const failedCommand = receipt.verification_commands.find(
    (result) => result.exit_code !== 0 && !result.timed_out && !result.cancelled,
  );
  if (failedCommand !== undefined) {
    lines.push(`${commandLabel(failedCommand)} · ${commandOutcome(failedCommand)}`);
    const output = boundedOutput(failedCommand);
    if (output !== undefined) lines.push(output);
  } else if (receipt.counterfactual?.classification === "CANDIDATE_FAILS") {
    lines.push(`counterfactual · ${receipt.counterfactual.diagnosis}`);
    const candidateOutput =
      receipt.counterfactual.candidate_result === null
        ? undefined
        : boundedOutput(receipt.counterfactual.candidate_result);
    const baselineOutput =
      receipt.counterfactual.baseline_result === null
        ? undefined
        : boundedOutput(receipt.counterfactual.baseline_result);
    const output = candidateOutput ?? baselineOutput;
    if (output !== undefined) lines.push(output);
  }
  for (const signal of receipt.scope_integrity.signals
    .filter((item) => item.severity === "FAIL")
    .slice(0, 3)) {
    lines.push(`${signal.code} · ${signal.file} · ${signal.observed}`);
  }
  for (const claim of receipt.effect_evidence.claims
    .filter(
      (item) =>
        item.status === "RUNTIME_CONTRADICTED" || item.status === "SOURCE_CONTRADICTED",
    )
    .slice(0, 3)) {
    lines.push(
      `effect · ${claim.claim_id} · ${claim.status} · expected ${claim.expected}`,
    );
  }
  lines.push("Inspect with /verity why. Repair only the evidenced failure.");
  return lines.join("\n");
}

function parseSubcommand(args: string): ProofSubcommand {
  const value = args.trim().split(/\s+/, 1)[0] ?? "";
  if (value === "") return "current";
  if (
    value === "run" ||
    value === "why" ||
    value === "receipt" ||
    value === "doctor" ||
    value === "policy"
  )
    return value;
  return "invalid";
}

const MAX_RECEIPTS_PER_ROOT = 50;

async function pruneReceipts(directory: string, keep: number): Promise<void> {
  try {
    const entries = await readdir(directory);
    const receipts = entries.filter((name) => name.endsWith(".json")).sort();
    const stale = receipts.slice(0, Math.max(0, receipts.length - keep));
    await Promise.all(stale.map((name) => rm(join(directory, name), { force: true })));
  } catch {
    /* pruning is best effort; receipts are diagnostics, not state */
  }
}

class PiVerityRuntime {
  private baseline: GitSnapshot | undefined;
  private root: string | undefined;
  private sessionId: string | undefined;
  private taskSequence = 0;
  private repositoryOperationObserved = false;
  private activeController: AbortController | undefined;
  private counterfactualBaseline: CounterfactualBaseline | undefined;
  private lastReceipt: ProofReceipt | undefined;
  private lastReceiptPath: string | undefined;
  private automaticRepairAttempts = 0;
  private verificationInProgress = false;
  private verityUiState: VerityUiState | undefined;
  private turnContract: TurnContract | undefined;
  private readonly executionPolicy = parseExecutionPolicy(
    process.env[EXECUTION_POLICY_ENV],
  );
  private readonly recentPolicyEvents: ExecutionPolicyEvent[] = [];

  constructor(private readonly pi: PiApi) {}

  private updateStatus(context: PiContext, next: VerityUiState, recover = false): void {
    this.verityUiState = transitionVerityStatus(this.verityUiState, next, recover);
    setVerityStatus(context, this.verityUiState);
  }

  register(): void {
    this.pi.on("session_start", async (_event, context) => {
      this.turnContract = undefined;
      this.updateStatus(context, { kind: "OBSERVING" }, true);
      await this.safeResetBaseline(context);
    });
    this.pi.on("input", (event) => {
      const text = event.text ?? "";
      this.turnContract = createTurnContract(text);
      // Calm UI: typing a prompt never demotes the visible verdict; the status
      // only moves when work actually happens.
    });
    this.pi.on("before_agent_start", async (event, _context) => {
      // Per-project init happened at session_start. A turn resets only
      // turn-scoped bookkeeping, so unchanged repositories are never
      // re-snapshotted per prompt.
      this.repositoryOperationObserved = false;
      this.taskSequence += 1;
      if (this.turnContract === undefined && event.prompt !== undefined)
        this.turnContract = createTurnContract(event.prompt);
      const injected = renderContractContext(this.turnContract);
      if (injected === undefined) return undefined;
      return {
        message: {
          customType: "pi-verity-turn-contract",
          content: injected,
          display: false,
        },
      };
    });
    this.pi.on("tool_call", (event, context) => this.handleToolCall(event, context));
    this.pi.on("agent_settled", async (_event, context) => {
      await this.runProof(context, false, false);
      this.turnContract = undefined;
    });
    this.pi.on("session_shutdown", async (_event, context) => {
      this.activeController?.abort();
      await this.counterfactualBaseline?.cleanup();
      this.turnContract = undefined;
      context.ui?.setStatus?.("pi-verity", undefined);
      this.verityUiState = undefined;
    });
    this.pi.registerCommand("verity", {
      description: "Show, run, explain, locate proof, or inspect execution policy",
      handler: async (args, context) => {
        await this.handleCommand(args, context);
      },
    });
    this.registerVerityCheck();
  }

  private registerVerityCheck(): void {
    if (this.pi.registerTool === undefined) return;
    this.pi.registerTool({
      name: "verity_check",
      label: "Verity check",
      description:
        "In-turn guidance against the current turn contract. Location hints only; never supplies expected values or a final verdict. Final proof still revalidates at agent_settled.",
      // SAFETY: Pi's runtime schema supports nested array-item objects; the local type only models flat properties.
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          hints: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim_id"],
              properties: {
                claim_id: { type: "string" },
                route: { type: "string" },
                selector: { type: "string" },
                file: { type: "string" },
              },
            },
          },
        },
      },
      execute: async (_toolCallId, params, signal) =>
        this.runVerityCheck(params, signal),
    });
  }

  private async runVerityCheck(
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<PiToolResult> {
    const contract = this.turnContract;
    if (contract === undefined || contract.claims.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "verity_check · no turn contract · nothing to check",
          },
        ],
        details: { claims: [] },
      };
    }
    const rawHints = Array.isArray(params.hints) ? params.hints : [];
    for (const item of rawHints) {
      if (item === null || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.claim_id !== "string") continue;
      const hint: ProbeHint = { claim_id: record.claim_id };
      if (typeof record.route === "string") hint.route = record.route;
      if (typeof record.selector === "string") hint.selector = record.selector;
      if (typeof record.file === "string") hint.file = record.file;
      addProbeHint(contract, hint);
    }
    const root = this.root ?? process.cwd();
    const evidence =
      contract.claims.length === 0
        ? EMPTY_EFFECT_EVIDENCE
        : await proveEffects({
            root,
            claims: contract.claims,
            ...(contract.hints.length > 0 ? { hints: contract.hints } : {}),
            ...(signal ? { signal } : {}),
          });
    const lines = evidence.claims.map((claim) => {
      const where = claim.observed === null ? "—" : claim.observed;
      return `${claim.claim_id} · ${claim.kind} · ${claim.status} · ${where}`;
    });
    let text =
      lines.length === 0
        ? "verity_check · no claims"
        : `verity_check (guidance only)\n${lines.join("\n")}`;
    if (text.length > 800) text = `${text.slice(0, 797)}...`;
    return { content: [{ type: "text", text }], details: evidence };
  }

  private async resetBaseline(context: PiContext): Promise<void> {
    await this.counterfactualBaseline?.cleanup();
    this.sessionId = context.sessionManager?.getSessionId?.();
    this.root = await findRepositoryRoot(context.cwd ?? process.cwd());
    this.baseline = await captureGitSnapshot(this.root);
    this.counterfactualBaseline = undefined;
    this.repositoryOperationObserved = false;
    this.taskSequence += 1;
  }

  private async safeResetBaseline(context: PiContext): Promise<void> {
    try {
      await this.resetBaseline(context);
    } catch {
      this.root = undefined;
      this.baseline = undefined;
      this.repositoryOperationObserved = false;
    }
  }

  private async observeToolCall(
    event: PiEvent,
    context?: PiContext,
    recover = false,
  ): Promise<void> {
    const name = event.toolName?.trim().toLowerCase();
    if (name === undefined || OBSERVATION_READ_ONLY.has(name)) return;
    if (this.root === undefined) return;
    this.repositoryOperationObserved = true;
    if (context !== undefined) {
      const state: VerityUiState = { kind: "CHANGE_PENDING" };
      state.detail = name;
      this.updateStatus(context, state, recover);
    }
    if (this.counterfactualBaseline === undefined && this.root !== undefined) {
      try {
        this.counterfactualBaseline = await captureCounterfactualBaseline(this.root);
      } catch {
        this.counterfactualBaseline = undefined;
      }
    }
  }

  private rememberPolicyEvent(event: ExecutionPolicyEvent): void {
    this.recentPolicyEvents.push(event);
    if (this.recentPolicyEvents.length > 8) this.recentPolicyEvents.shift();
  }

  private recordPolicyEvent(event: ExecutionPolicyEvent): boolean {
    try {
      this.pi.appendEntry("pi-verity-policy", event);
      this.rememberPolicyEvent(event);
      return true;
    } catch {
      return false;
    }
  }

  private exposePolicyBlock(
    context: PiContext,
    toolName: string,
    detail: string,
  ): void {
    const content = `verity ⛔ BLOCKED · ${toolName}\n${detail}`;
    if (context.hasUI === true && context.ui?.notify !== undefined) {
      context.ui.notify(content, "error");
      return;
    }
    this.pi.sendMessage(
      {
        customType: "pi-verity-policy-block",
        content,
        display: true,
        details: { toolName, detail },
      },
      { triggerTurn: false, deliverAs: "nextTurn" },
    );
  }

  private blockToolCall(
    context: PiContext,
    event: PiEvent,
    block: {
      decision: Exclude<ExecutionPolicyDecision, "ALLOW" | "NOT_REQUIRED">;
      reason: string;
      detail: string;
      requestHash: string;
      requestSummary?: string;
    },
  ): PiToolCallResult {
    const toolName = event.toolName ?? "unknown";
    const policyEvent: ExecutionPolicyEvent = {
      created_at: new Date().toISOString(),
      session_id: context.sessionManager?.getSessionId?.() ?? null,
      tool_call_id: event.toolCallId ?? "unavailable",
      tool_name: toolName,
      request_hash: block.requestHash,
      decision: block.decision,
      policy_mode: this.executionPolicy.mode,
      reason: block.reason,
    };
    if (block.requestSummary !== undefined) {
      policyEvent.request_summary = block.requestSummary;
    }
    if (!this.recordPolicyEvent(policyEvent)) {
      this.rememberPolicyEvent({
        ...policyEvent,
        reason: `${policyEvent.reason}; EXECUTION_AUDIT_WRITE_FAILED`,
      });
    }
    this.updateStatus(context, { kind: "BLOCKED", detail: toolName }, true);
    this.exposePolicyBlock(context, toolName, block.detail);
    return { block: true, reason: block.reason, terminate: true };
  }

  private async handleToolCall(
    event: PiEvent,
    context: PiContext,
  ): Promise<PiToolCallResult | undefined> {
    const toolName = event.toolName ?? "";
    if (!requiresExecutionApproval(this.executionPolicy.mode, toolName)) {
      await this.observeToolCall(event, context);
      return undefined;
    }

    if (
      event.toolCallId === undefined ||
      event.input === undefined ||
      toolName === ""
    ) {
      return this.blockToolCall(context, event, {
        decision: "BLOCK_INVALID_REQUEST",
        reason: "EXECUTION_REQUEST_IDENTITY_UNAVAILABLE",
        detail: "request identity unavailable",
        requestHash: sha256(`unavailable:${event.toolCallId ?? ""}:${toolName}`),
      });
    }

    let requestHash: string;
    let requestSummary: string;
    try {
      requestHash = fingerprintExecutionRequest({
        sessionId: context.sessionManager?.getSessionId?.() ?? null,
        toolCallId: event.toolCallId,
        toolName,
        input: event.input,
      }).request_hash;
      requestSummary = summarizeExecutionRequest(toolName, event.input);
    } catch {
      return this.blockToolCall(context, event, {
        decision: "BLOCK_INVALID_REQUEST",
        reason: "EXECUTION_REQUEST_UNHASHABLE",
        detail: "request cannot be authorized deterministically",
        requestHash: sha256(`unhashable:${event.toolCallId}:${toolName}`),
      });
    }

    if (context.hasUI !== true || context.ui?.confirm === undefined) {
      return this.blockToolCall(context, event, {
        decision: "BLOCK_NO_UI",
        reason: "EXECUTION_APPROVAL_UNAVAILABLE",
        detail: "approval unavailable in non-interactive mode",
        requestHash,
        requestSummary,
      });
    }

    this.updateStatus(context, { kind: "APPROVAL_REQUIRED", detail: toolName }, true);
    let approved = false;
    try {
      approved = await context.ui.confirm(
        "Verity execution approval",
        `Tool:\n${toolName}\n\nRequest:\n${requestSummary}\n\nAllow this exact tool call?`,
      );
    } catch {
      return this.blockToolCall(context, event, {
        decision: "BLOCK_NO_UI",
        reason: "EXECUTION_APPROVAL_UNAVAILABLE",
        detail: "approval interaction failed",
        requestHash,
        requestSummary,
      });
    }
    if (!approved) {
      return this.blockToolCall(context, event, {
        decision: "DENY",
        reason: "EXECUTION_APPROVAL_DENIED",
        detail: "explicit approval denied",
        requestHash,
        requestSummary,
      });
    }

    try {
      lockExecutionInput(event.input);
    } catch {
      return this.blockToolCall(context, event, {
        decision: "BLOCK_INVALID_REQUEST",
        reason: "EXECUTION_REQUEST_LOCK_FAILED",
        detail: "approved request could not be locked",
        requestHash,
        requestSummary,
      });
    }

    const recorded = this.recordPolicyEvent({
      created_at: new Date().toISOString(),
      session_id: context.sessionManager?.getSessionId?.() ?? null,
      tool_call_id: event.toolCallId,
      tool_name: toolName,
      request_hash: requestHash,
      decision: "ALLOW",
      policy_mode: this.executionPolicy.mode,
      reason: "EXPLICIT_APPROVAL",
      request_summary: requestSummary,
    });
    if (!recorded) {
      this.rememberPolicyEvent({
        created_at: new Date().toISOString(),
        session_id: context.sessionManager?.getSessionId?.() ?? null,
        tool_call_id: event.toolCallId,
        tool_name: toolName,
        request_hash: requestHash,
        decision: "BLOCK_AUDIT_ERROR",
        policy_mode: this.executionPolicy.mode,
        reason: "EXECUTION_AUDIT_WRITE_FAILED",
        request_summary: requestSummary,
      });
      this.updateStatus(context, { kind: "BLOCKED", detail: toolName }, true);
      this.exposePolicyBlock(
        context,
        toolName,
        "local policy event could not be persisted",
      );
      return {
        block: true,
        reason: "EXECUTION_AUDIT_WRITE_FAILED",
        terminate: true,
      };
    }

    await this.observeToolCall(event, context, true);
    if (this.verityUiState?.kind === "APPROVAL_REQUIRED") {
      this.updateStatus(context, { kind: "OBSERVING" }, true);
    }
    return undefined;
  }

  private verifyOptions(
    context: PiContext,
    capturedWorkspace: CounterfactualBaseline | undefined,
  ): VerifyOptions {
    const options: VerifyOptions = {
      cwd: this.root ?? context.cwd ?? process.cwd(),
      allowCounterfactualNetwork:
        process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK === "1",
      taskId: taskId(this.sessionId, this.taskSequence),
    };
    if (this.activeController !== undefined) {
      options.signal = this.activeController.signal;
    }
    if (this.baseline !== undefined) options.baseline = this.baseline;
    if (this.sessionId !== undefined) options.sessionId = this.sessionId;
    if (capturedWorkspace !== undefined) {
      options.counterfactualBaseline = capturedWorkspace;
    }
    if (this.turnContract !== undefined && this.turnContract.claims.length > 0) {
      options.observableClaims = this.turnContract.claims;
      if (this.turnContract.hints.length > 0)
        options.probeHints = this.turnContract.hints;
    }
    return options;
  }

  private async persistReceipt(
    receipt: ProofReceipt,
    context: PiContext,
  ): Promise<string> {
    const rootKey = sha256(
      receipt.repository_root ?? context.cwd ?? process.cwd(),
    ).slice(7, 23);
    const file = join(
      homedir(),
      ".pi",
      "agent",
      "pi-verity",
      "receipts",
      rootKey,
      `${receipt.session_id ?? "session"}-${Date.now()}.json`,
    );
    await writeReceipt(file, receipt);
    await pruneReceipts(dirname(file), MAX_RECEIPTS_PER_ROOT);
    this.pi.appendEntry("pi-verity", {
      receiptPath: file,
      verdict: receipt.verdict,
      changedFiles: receipt.changed_files,
    });
    return file;
  }

  private exposeFailure(receipt: ProofReceipt): void {
    const evidence = minimalFailureEvidence(receipt);
    const limit = configuredRepairLimit();
    if (limit > 0 && this.automaticRepairAttempts < limit) {
      this.automaticRepairAttempts += 1;
      this.pi.sendMessage(
        {
          customType: "pi-verity-failure",
          content: `${evidence}\nAutomatic repair attempt ${this.automaticRepairAttempts}/${limit}.`,
          display: true,
          details: { verdict: receipt.verdict },
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
      return;
    }
    const reason =
      limit === 0
        ? "automatic repair is disabled (set PI_VERITY_MAX_REPAIR_ATTEMPTS to enable)"
        : `automatic repair limit reached (${limit}); stop automatic repair`;
    this.pi.sendMessage(
      {
        customType: "pi-verity-failure",
        content: `${evidence}\n${reason}.`,
        display: true,
        details: { verdict: receipt.verdict },
      },
      { triggerTurn: false, deliverAs: "nextTurn" },
    );
  }

  private async captureRepairBaseline(): Promise<void> {
    if (this.root === undefined) return;
    try {
      this.counterfactualBaseline = await captureCounterfactualBaseline(this.root);
    } catch {
      this.counterfactualBaseline = undefined;
    }
  }

  private async runProof(
    context: PiContext,
    force: boolean,
    announce: boolean,
  ): Promise<ProofReceipt | undefined> {
    // Outside a git repository there is nothing to prove; staying quiet is the
    // calm default, not a verification failure.
    if (this.root === undefined) return undefined;
    if (!force && !this.repositoryOperationObserved) return undefined;
    if (!force && this.root !== undefined && this.baseline !== undefined) {
      const current = await captureGitSnapshot(this.root);
      if (current.state_hash === this.baseline.state_hash) {
        this.repositoryOperationObserved = false;
        return undefined;
      }
    }
    if (this.verificationInProgress) {
      if (announce) {
        context.ui?.notify?.("verity: verification already running", "info");
      }
      return undefined;
    }
    this.verificationInProgress = true;
    this.repositoryOperationObserved = false;
    this.updateStatus(context, { kind: "VERIFYING" }, true);
    this.activeController = new AbortController();
    const capturedWorkspace = this.counterfactualBaseline;
    this.counterfactualBaseline = undefined;
    // Keep the status keyed and persistent across verification.
    try {
      const receipt = await verifyRepository(
        this.verifyOptions(context, capturedWorkspace),
      );
      const file = await this.persistReceipt(receipt, context);
      this.lastReceipt = receipt;
      this.lastReceiptPath = file;
      let diff: GitDiffStat | null = null;
      if (this.root !== undefined) {
        try {
          diff = await captureGitDiffStat(this.root);
        } catch {
          diff = null;
        }
      }
      this.updateStatus(context, receiptUiState(receipt), true);
      // Ambient failures remain visible; PASS updates status only unless explicit.
      if (announce || receipt.verdict !== "PASS") {
        context.ui?.notify?.(
          formatReceiptSummary(receipt, diff),
          receiptLevel(receipt.verdict),
        );
      }
      if (this.root !== undefined) {
        this.baseline = await captureGitSnapshot(this.root);
      }
      if (receipt.verdict === "FAIL") {
        await this.captureRepairBaseline();
        this.exposeFailure(receipt);
      } else {
        this.automaticRepairAttempts = 0;
      }
      return receipt;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.updateStatus(context, { kind: "FAILED", detail }, true);
      context.ui?.notify?.(`verity could not verify: ${detail}`, "error");
      return undefined;
    } finally {
      await capturedWorkspace?.cleanup();
      this.activeController = undefined;
      this.verificationInProgress = false;
    }
  }

  private async receiptIsStale(): Promise<boolean> {
    if (this.lastReceipt?.repository_root == null) return false;
    try {
      const current = await captureGitSnapshot(this.lastReceipt.repository_root);
      return !receiptMatchesState(this.lastReceipt, current);
    } catch {
      return true;
    }
  }

  private policyWhyLine(): string | undefined {
    const latest = this.recentPolicyEvents.at(-1);
    if (latest === undefined) return undefined;
    return `execution policy · ${formatExecutionPolicyEvent(latest)} · ${latest.reason}`;
  }

  private formatPolicyStatus(): string {
    if (!this.executionPolicy.valid) {
      return [
        `execution policy · invalid (${JSON.stringify(this.executionPolicy.configured_value)})`,
        "runtime behavior · fail-safe all",
        ...this.recentPolicyEvents.map(formatExecutionPolicyEvent),
      ].join("\n");
    }
    if (this.executionPolicy.mode === "off") {
      return [
        "execution policy · off",
        "set PI_VERITY_EXECUTION_POLICY=mutating|all to enable",
      ].join("\n");
    }
    const lines = [`execution policy · ${this.executionPolicy.mode}`];
    if (this.recentPolicyEvents.length === 0) {
      lines.push("recent decisions · none");
    } else {
      lines.push("", "recent decisions");
      lines.push(...this.recentPolicyEvents.map(formatExecutionPolicyEvent));
    }
    return lines.join("\n");
  }

  private formatPolicyDoctor(): string {
    if (!this.executionPolicy.valid) {
      return [
        `execution policy: invalid (${JSON.stringify(this.executionPolicy.configured_value)})`,
        "runtime behavior: fail-safe all",
        "approval behavior: interactive confirmation required",
        "non-interactive behavior: deny",
      ].join("\n");
    }
    if (this.executionPolicy.mode === "off") return "execution policy: off";
    return [
      `execution policy: ${this.executionPolicy.mode}`,
      "approval behavior: interactive confirmation required",
      "non-interactive behavior: deny",
    ].join("\n");
  }

  private notifyWhy(context: PiContext, stale: boolean): void {
    const policyLine = this.policyWhyLine();
    if (this.lastReceipt === undefined) {
      this.updateStatus(
        context,
        { kind: "UNPROVEN", detail: "no current receipt" },
        true,
      );
      context.ui?.notify?.(
        ["verity: no current receipt · run /verity run", policyLine]
          .filter((line) => line !== undefined)
          .join("\n"),
        "warning",
      );
      return;
    }
    if (stale) {
      this.updateStatus(
        context,
        { kind: "UNPROVEN", detail: "repository changed" },
        true,
      );
    }
    const prefix = stale ? "STALE · repository changed after this receipt\n" : "";
    const suffix = policyLine === undefined ? "" : `\n${policyLine}`;
    const level = stale ? "warning" : receiptLevel(this.lastReceipt.verdict);
    context.ui?.notify?.(
      `${prefix}${explainReceipt(this.lastReceipt)}${suffix}`,
      level,
    );
  }

  private notifyReceipt(context: PiContext): void {
    if (this.lastReceipt === undefined || this.lastReceiptPath === undefined) {
      this.updateStatus(
        context,
        { kind: "UNPROVEN", detail: "no current receipt" },
        true,
      );
      context.ui?.notify?.("verity: no current receipt · run /verity run", "warning");
      return;
    }
    context.ui?.notify?.(
      `verity receipt · ${this.lastReceiptPath}\n${canonicalJson(this.lastReceipt)}`,
      "info",
    );
  }

  private notifyCurrent(context: PiContext, stale: boolean): void {
    if (this.lastReceipt === undefined) {
      this.updateStatus(
        context,
        { kind: "UNPROVEN", detail: "no current receipt" },
        true,
      );
      context.ui?.notify?.("verity: no current receipt · run /verity run", "warning");
      return;
    }
    if (stale) {
      this.updateStatus(
        context,
        { kind: "CHANGE_PENDING", detail: "repository changed" },
        true,
      );
      context.ui?.notify?.(
        "verity ⚠ STALE · repository changed · /verity run",
        "warning",
      );
      return;
    }
    this.updateStatus(context, receiptUiState(this.lastReceipt), true);
    context.ui?.notify?.(
      formatReceiptSummary(this.lastReceipt),
      receiptLevel(this.lastReceipt.verdict),
    );
  }

  private async handleCommand(args: string, context: PiContext): Promise<void> {
    const subcommand = parseSubcommand(args);
    if (subcommand === "run") {
      await this.runProof(context, true, true);
      return;
    }
    if (subcommand === "invalid") {
      this.updateStatus(context, { kind: "WARNING", detail: "invalid command" }, true);
      context.ui?.notify?.("Usage: /verity [run|why|receipt|doctor|policy]", "warning");
      return;
    }
    if (subcommand === "policy") {
      this.updateStatus(
        context,
        this.executionPolicy.valid
          ? { kind: "OBSERVING", detail: "policy" }
          : { kind: "FAILED", detail: "invalid policy" },
        true,
      );
      context.ui?.notify?.(
        this.formatPolicyStatus(),
        this.executionPolicy.valid ? "info" : "error",
      );
      return;
    }
    if (subcommand === "doctor") {
      try {
        const report = await runDoctor(context.cwd ?? process.cwd());
        context.ui?.notify?.(
          `${formatDoctorReport(report)}\n✓ Pi adapter loaded\n${repairStatus()}\n${this.formatPolicyDoctor()}`,
          report.ready && this.executionPolicy.valid ? "info" : "error",
        );
      } catch (error) {
        context.ui?.notify?.(
          `verity doctor failed: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
      return;
    }
    if (subcommand === "receipt") {
      this.notifyReceipt(context);
      return;
    }
    const stale = await this.receiptIsStale();
    if (subcommand === "why") this.notifyWhy(context, stale);
    else this.notifyCurrent(context, stale);
  }
}

export default function piVerity(pi: PiApi): void {
  new PiVerityRuntime(pi).register();
}
