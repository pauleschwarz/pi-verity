import { homedir } from "node:os";
import { join } from "node:path";
import { formatDoctorReport, runDoctor } from "../core/doctor.js";
import { captureGitSnapshot, findRepositoryRoot } from "../core/git.js";
import { canonicalJson, sha256 } from "../core/hash.js";
import { writeReceipt } from "../core/receipt.js";
import type {
  CommandResult,
  GitSnapshot,
  ProofReceipt,
  VerifyOptions,
} from "../core/types.js";
import { verifyRepository } from "../core/verifier.js";
import {
  type CounterfactualBaseline,
  captureCounterfactualBaseline,
} from "../core/workspace.js";

interface PiContext {
  cwd?: string;
  sessionManager?: { getSessionId?: () => string };
  ui?: {
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
    setStatus?: (key: string, value: string | undefined) => void;
  };
}

interface PiEvent {
  toolName?: string;
}

interface PiApi {
  on: (
    event: string,
    handler: (event: PiEvent, context: PiContext) => Promise<void> | void,
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
}

type NoticeLevel = "error" | "warning" | "info";
type ProofSubcommand = "current" | "run" | "why" | "receipt" | "doctor" | "invalid";

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

function configuredRepairLimit(): number {
  const configured = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
  if (configured === undefined) return 0;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
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

function checkCount(receipt: ProofReceipt): number {
  return (
    receipt.verification_commands.length + (receipt.counterfactual === null ? 0 : 1) + 1
  );
}

export function formatReceiptSummary(receipt: ProofReceipt): string {
  const seconds = (receiptDuration(receipt) / 1000).toFixed(1);
  if (receipt.verdict === "PASS") {
    return `pi-verity ✓ ${checkCount(receipt)} checks · ${seconds}s · proof: PASS`;
  }

  const marker = receipt.verdict === "FAIL" ? "✗" : "⚠";
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
  const details = [
    ...failedCommands,
    ...counterfactualFailure,
    ...signalDetails,
    ...receipt.warnings,
    ...receipt.unverified_dimensions,
  ].slice(0, 2);
  const suffix = details.length === 0 ? "" : `\n${details.join(" · ")}`;
  return `pi-verity ${marker} ${receipt.verdict}${suffix}\n/verity why`;
}

export function explainReceipt(receipt: ProofReceipt): string {
  const lines = [`pi-verity ${receipt.verdict}`];
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

export function minimalFailureEvidence(receipt: ProofReceipt): string {
  const lines = ["pi-verity deterministic failure:"];
  const failedCommand = receipt.verification_commands.find(
    (result) => result.exit_code !== 0 && !result.timed_out && !result.cancelled,
  );
  if (failedCommand !== undefined) {
    lines.push(`${commandLabel(failedCommand)} · ${commandOutcome(failedCommand)}`);
    const output = boundedOutput(failedCommand);
    if (output !== undefined) lines.push(output);
  } else if (receipt.counterfactual?.classification === "CANDIDATE_FAILS") {
    lines.push(`counterfactual · ${receipt.counterfactual.diagnosis}`);
  }
  for (const signal of receipt.scope_integrity.signals
    .filter((item) => item.severity === "FAIL")
    .slice(0, 3)) {
    lines.push(`${signal.code} · ${signal.file} · ${signal.observed}`);
  }
  lines.push("Inspect with /verity why. Repair only the evidenced failure.");
  return lines.join("\n");
}

function parseSubcommand(args: string): ProofSubcommand {
  const value = args.trim().split(/\s+/, 1)[0] ?? "";
  if (value === "") return "current";
  if (value === "run" || value === "why" || value === "receipt" || value === "doctor")
    return value;
  return "invalid";
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

  constructor(private readonly pi: PiApi) {}

  register(): void {
    this.pi.on("session_start", async (_event, context) => {
      await this.safeResetBaseline(context);
    });
    this.pi.on("before_agent_start", async (_event, context) => {
      await this.safeResetBaseline(context);
    });
    this.pi.on("tool_call", (event) => {
      this.observeToolCall(event);
    });
    this.pi.on("agent_settled", async (_event, context) => {
      await this.runProof(context, false, false);
    });
    this.pi.on("session_shutdown", async () => {
      this.activeController?.abort();
      await this.counterfactualBaseline?.cleanup();
    });
    this.pi.registerCommand("verity", {
      description: "Show, run, explain, or locate deterministic proof",
      handler: async (args, context) => {
        await this.handleCommand(args, context);
      },
    });
  }

  private async resetBaseline(context: PiContext): Promise<void> {
    await this.counterfactualBaseline?.cleanup();
    this.sessionId = context.sessionManager?.getSessionId?.();
    this.root = await findRepositoryRoot(context.cwd ?? process.cwd());
    this.baseline = await captureGitSnapshot(this.root);
    this.counterfactualBaseline = await captureCounterfactualBaseline(this.root);
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

  private observeToolCall(event: PiEvent): void {
    const name = event.toolName;
    if (["write", "edit", "bash", "apply_patch"].includes(name ?? "")) {
      this.repositoryOperationObserved = true;
    }
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
    const canRepair = this.automaticRepairAttempts < limit;
    if (canRepair) {
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
    this.pi.sendMessage(
      {
        customType: "pi-verity-failure",
        content: `${evidence}\nAutomatic repair limit reached (${limit}); stop automatic repair.`,
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
        context.ui?.notify?.("pi-verity: verification already running", "info");
      }
      return undefined;
    }
    this.verificationInProgress = true;
    this.repositoryOperationObserved = false;
    this.activeController = new AbortController();
    const capturedWorkspace = this.counterfactualBaseline;
    this.counterfactualBaseline = undefined;
    context.ui?.setStatus?.("pi-verity", "verifying repository");
    try {
      const receipt = await verifyRepository(
        this.verifyOptions(context, capturedWorkspace),
      );
      const file = await this.persistReceipt(receipt, context);
      this.lastReceipt = receipt;
      this.lastReceiptPath = file;
      if (announce || receipt.verdict !== "PASS") {
        context.ui?.notify?.(
          formatReceiptSummary(receipt),
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
      context.ui?.notify?.(`pi-verity could not verify: ${detail}`, "error");
      return undefined;
    } finally {
      await capturedWorkspace?.cleanup();
      this.activeController = undefined;
      this.verificationInProgress = false;
      context.ui?.setStatus?.("pi-verity", undefined);
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

  private notifyWhy(context: PiContext, stale: boolean): void {
    if (this.lastReceipt === undefined) {
      context.ui?.notify?.(
        "pi-verity: no current receipt · run /verity run",
        "warning",
      );
      return;
    }
    const prefix = stale ? "STALE · repository changed after this receipt\n" : "";
    const level = stale ? "warning" : receiptLevel(this.lastReceipt.verdict);
    context.ui?.notify?.(`${prefix}${explainReceipt(this.lastReceipt)}`, level);
  }

  private notifyReceipt(context: PiContext): void {
    if (this.lastReceipt === undefined || this.lastReceiptPath === undefined) {
      context.ui?.notify?.(
        "pi-verity: no current receipt · run /verity run",
        "warning",
      );
      return;
    }
    context.ui?.notify?.(
      `pi-verity receipt · ${this.lastReceiptPath}\n${canonicalJson(this.lastReceipt)}`,
      "info",
    );
  }

  private notifyCurrent(context: PiContext, stale: boolean): void {
    if (this.lastReceipt === undefined) {
      context.ui?.notify?.(
        "pi-verity: no current receipt · run /verity run",
        "warning",
      );
      return;
    }
    if (stale) {
      context.ui?.notify?.(
        "pi-verity ⚠ STALE · repository changed · /verity run",
        "warning",
      );
      return;
    }
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
      context.ui?.notify?.("Usage: /verity [run|why|receipt|doctor]", "warning");
      return;
    }
    if (subcommand === "doctor") {
      try {
        const report = await runDoctor(context.cwd ?? process.cwd());
        context.ui?.notify?.(
          `${formatDoctorReport(report)}\n${repairStatus()}`,
          report.ready ? "info" : "error",
        );
      } catch (error) {
        context.ui?.notify?.(
          `pi-verity doctor failed: ${error instanceof Error ? error.message : String(error)}`,
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
