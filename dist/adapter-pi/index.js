import { homedir } from "node:os";
import { join } from "node:path";
import { formatDoctorReport, runDoctor } from "../core/doctor.js";
import { captureGitDiffStat, captureGitSnapshot, findRepositoryRoot, } from "../core/git.js";
import { canonicalJson, sha256 } from "../core/hash.js";
import { writeReceipt } from "../core/receipt.js";
import { verifyRepository } from "../core/verifier.js";
import { captureCounterfactualBaseline, } from "../core/workspace.js";
function receiptLevel(verdict) {
    if (verdict === "FAIL")
        return "error";
    if (verdict === "UNPROVEN" || verdict === "PASS_WITH_WARNINGS") {
        return "warning";
    }
    return "info";
}
function taskId(sessionId, sequence) {
    if (sessionId === undefined)
        return `turn-${sequence}`;
    return `${sessionId}:turn-${sequence}`;
}
function configuredRepairLimit() {
    const configured = process.env.PI_VERITY_MAX_REPAIR_ATTEMPTS;
    if (configured === undefined)
        return 0;
    const parsed = Number(configured);
    if (!Number.isSafeInteger(parsed) || parsed < 0)
        return 0;
    return Math.min(parsed, 10);
}
function repairStatus() {
    const limit = configuredRepairLimit();
    return limit === 0
        ? "automatic repair: disabled"
        : `automatic repair: enabled (limit ${limit})`;
}
function commandLabel(result) {
    return result.command.join(" ");
}
function commandOutcome(result) {
    if (result.cancelled)
        return "cancelled";
    if (result.timed_out)
        return "timed out";
    if (result.exit_code === 0)
        return "PASS";
    return `FAIL (exit ${result.exit_code ?? "unknown"})`;
}
function receiptDuration(receipt) {
    const standard = receipt.verification_commands.reduce((total, result) => total + result.duration_ms, 0);
    const counterfactual = receipt.counterfactual;
    return (standard +
        (counterfactual?.baseline_result?.duration_ms ?? 0) +
        (counterfactual?.candidate_result?.duration_ms ?? 0));
}
function formatDiffFacts(receipt, diff) {
    const files = diff?.files ?? receipt.changed_files.length;
    const added = diff?.added;
    const removed = diff?.removed;
    const counts = added !== undefined && removed !== undefined
        ? `${files} file${files === 1 ? "" : "s"} +${added}/-${removed}`
        : `${files} file${files === 1 ? "" : "s"}`;
    const ms = Math.max(0, Math.round(receiptDuration(receipt)));
    return `${counts} · ${ms}ms`;
}
function summaryDiagnostics(receipt) {
    const failedCommands = receipt.verification_commands.flatMap((result) => result.exit_code !== 0 && !result.timed_out && !result.cancelled
        ? [`${commandLabel(result)} failed`]
        : []);
    const counterfactualFailure = receipt.counterfactual?.classification === "CANDIDATE_FAILS"
        ? [receipt.counterfactual.diagnosis]
        : [];
    const signalDetails = receipt.scope_integrity.signals.flatMap((signal) => signal.severity === "INFORMATION" ? [] : [signal.observed]);
    return [
        ...failedCommands,
        ...counterfactualFailure,
        ...signalDetails,
        ...receipt.warnings,
        ...receipt.unverified_dimensions,
    ].slice(0, 3);
}
export function formatReceiptSummary(receipt, diff) {
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
    const primary = diff?.primaryPath ??
        receipt.changed_files.slice().sort((a, b) => a.localeCompare(b))[0];
    const head = primary === undefined
        ? `verity ${marker} ${receipt.verdict} · ${facts}`
        : `verity ${marker} ${receipt.verdict} · ${primary}`;
    const details = summaryDiagnostics(receipt);
    const body = details.length === 0 ? "" : `\n${details.join("\n")}`;
    return `${head}${body}\n/verity why`;
}
export function explainReceipt(receipt) {
    const lines = [`pi-verity ${receipt.verdict}`];
    if (receipt.verification_commands.length === 0) {
        lines.push("check · unavailable · no supported safe verification command was selected");
    }
    else {
        for (const result of receipt.verification_commands) {
            lines.push(`check · ${commandLabel(result)} · selected from ${result.source} (${result.kind}) · ${commandOutcome(result)}`);
        }
    }
    if (receipt.counterfactual === null) {
        lines.push("counterfactual · not selected · no changed test required it");
    }
    else {
        lines.push(`counterfactual · ${receipt.counterfactual.classification} · ${receipt.counterfactual.diagnosis}`);
        lines.push(`PATCH_POLARITY = ${receipt.counterfactual.patch_polarity}`);
    }
    const scope = receipt.scope_integrity;
    const scopeSelection = scope.available ? "selected" : "unavailable";
    const scopeReason = scope.reason === null ? "" : ` · ${scope.reason}`;
    lines.push(`scope integrity · ${scopeSelection} · baseline ${scope.baseline_source}${scopeReason}`);
    for (const signal of scope.signals) {
        lines.push(`${signal.severity} ${signal.code} · ${signal.file} · ${signal.observed} · ${signal.why}`);
        for (const evidence of signal.evidence) {
            lines.push(`  evidence · ${evidence}`);
        }
    }
    for (const warning of receipt.warnings)
        lines.push(`warning · ${warning}`);
    for (const dimension of receipt.unverified_dimensions) {
        lines.push(`unverified · ${dimension}`);
    }
    return lines.join("\n");
}
function boundedOutput(result) {
    const output = (result.stderr || result.stdout).trim();
    if (output.length === 0)
        return undefined;
    const tail = output.slice(-800);
    return tail.replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}
export function receiptMatchesState(receipt, current) {
    return receipt.final_diff_hash === current.state_hash;
}
export function minimalFailureEvidence(receipt) {
    const lines = ["pi-verity deterministic failure:"];
    const failedCommand = receipt.verification_commands.find((result) => result.exit_code !== 0 && !result.timed_out && !result.cancelled);
    if (failedCommand !== undefined) {
        lines.push(`${commandLabel(failedCommand)} · ${commandOutcome(failedCommand)}`);
        const output = boundedOutput(failedCommand);
        if (output !== undefined)
            lines.push(output);
    }
    else if (receipt.counterfactual?.classification === "CANDIDATE_FAILS") {
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
function parseSubcommand(args) {
    const value = args.trim().split(/\s+/, 1)[0] ?? "";
    if (value === "")
        return "current";
    if (value === "run" || value === "why" || value === "receipt" || value === "doctor")
        return value;
    return "invalid";
}
class PiVerityRuntime {
    pi;
    baseline;
    root;
    sessionId;
    taskSequence = 0;
    repositoryOperationObserved = false;
    activeController;
    counterfactualBaseline;
    lastReceipt;
    lastReceiptPath;
    automaticRepairAttempts = 0;
    verificationInProgress = false;
    constructor(pi) {
        this.pi = pi;
    }
    register() {
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
    async resetBaseline(context) {
        await this.counterfactualBaseline?.cleanup();
        this.sessionId = context.sessionManager?.getSessionId?.();
        this.root = await findRepositoryRoot(context.cwd ?? process.cwd());
        this.baseline = await captureGitSnapshot(this.root);
        this.counterfactualBaseline = await captureCounterfactualBaseline(this.root);
        this.repositoryOperationObserved = false;
        this.taskSequence += 1;
    }
    async safeResetBaseline(context) {
        try {
            await this.resetBaseline(context);
        }
        catch {
            this.root = undefined;
            this.baseline = undefined;
            this.repositoryOperationObserved = false;
        }
    }
    observeToolCall(event) {
        const name = event.toolName;
        if (["write", "edit", "bash", "apply_patch"].includes(name ?? "")) {
            this.repositoryOperationObserved = true;
        }
    }
    verifyOptions(context, capturedWorkspace) {
        const options = {
            cwd: this.root ?? context.cwd ?? process.cwd(),
            allowCounterfactualNetwork: process.env.PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK === "1",
            taskId: taskId(this.sessionId, this.taskSequence),
        };
        if (this.activeController !== undefined) {
            options.signal = this.activeController.signal;
        }
        if (this.baseline !== undefined)
            options.baseline = this.baseline;
        if (this.sessionId !== undefined)
            options.sessionId = this.sessionId;
        if (capturedWorkspace !== undefined) {
            options.counterfactualBaseline = capturedWorkspace;
        }
        return options;
    }
    async persistReceipt(receipt, context) {
        const rootKey = sha256(receipt.repository_root ?? context.cwd ?? process.cwd()).slice(7, 23);
        const file = join(homedir(), ".pi", "agent", "pi-verity", "receipts", rootKey, `${receipt.session_id ?? "session"}-${Date.now()}.json`);
        await writeReceipt(file, receipt);
        this.pi.appendEntry("pi-verity", {
            receiptPath: file,
            verdict: receipt.verdict,
            changedFiles: receipt.changed_files,
        });
        return file;
    }
    exposeFailure(receipt) {
        const evidence = minimalFailureEvidence(receipt);
        const limit = configuredRepairLimit();
        const canRepair = this.automaticRepairAttempts < limit;
        if (canRepair) {
            this.automaticRepairAttempts += 1;
            this.pi.sendMessage({
                customType: "pi-verity-failure",
                content: `${evidence}\nAutomatic repair attempt ${this.automaticRepairAttempts}/${limit}.`,
                display: true,
                details: { verdict: receipt.verdict },
            }, { triggerTurn: true, deliverAs: "followUp" });
            return;
        }
        this.pi.sendMessage({
            customType: "pi-verity-failure",
            content: `${evidence}\nAutomatic repair limit reached (${limit}); stop automatic repair.`,
            display: true,
            details: { verdict: receipt.verdict },
        }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
    async captureRepairBaseline() {
        if (this.root === undefined)
            return;
        try {
            this.counterfactualBaseline = await captureCounterfactualBaseline(this.root);
        }
        catch {
            this.counterfactualBaseline = undefined;
        }
    }
    async runProof(context, force, announce) {
        if (!force && !this.repositoryOperationObserved)
            return undefined;
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
            const receipt = await verifyRepository(this.verifyOptions(context, capturedWorkspace));
            const file = await this.persistReceipt(receipt, context);
            this.lastReceipt = receipt;
            this.lastReceiptPath = file;
            let diff = null;
            if (this.root !== undefined) {
                try {
                    diff = await captureGitDiffStat(this.root);
                }
                catch {
                    diff = null;
                }
            }
            // Ambient rule: one quiet PASS line after a real repository mutation;
            // explicit /verity run always announces; read-only turns never reach here.
            if (announce || receipt.verdict !== "PASS" || !force) {
                context.ui?.notify?.(formatReceiptSummary(receipt, diff), receiptLevel(receipt.verdict));
            }
            if (this.root !== undefined) {
                this.baseline = await captureGitSnapshot(this.root);
            }
            if (receipt.verdict === "FAIL") {
                await this.captureRepairBaseline();
                this.exposeFailure(receipt);
            }
            else {
                this.automaticRepairAttempts = 0;
            }
            return receipt;
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            context.ui?.notify?.(`pi-verity could not verify: ${detail}`, "error");
            return undefined;
        }
        finally {
            await capturedWorkspace?.cleanup();
            this.activeController = undefined;
            this.verificationInProgress = false;
            context.ui?.setStatus?.("pi-verity", undefined);
        }
    }
    async receiptIsStale() {
        if (this.lastReceipt?.repository_root == null)
            return false;
        try {
            const current = await captureGitSnapshot(this.lastReceipt.repository_root);
            return !receiptMatchesState(this.lastReceipt, current);
        }
        catch {
            return true;
        }
    }
    notifyWhy(context, stale) {
        if (this.lastReceipt === undefined) {
            context.ui?.notify?.("pi-verity: no current receipt · run /verity run", "warning");
            return;
        }
        const prefix = stale ? "STALE · repository changed after this receipt\n" : "";
        const level = stale ? "warning" : receiptLevel(this.lastReceipt.verdict);
        context.ui?.notify?.(`${prefix}${explainReceipt(this.lastReceipt)}`, level);
    }
    notifyReceipt(context) {
        if (this.lastReceipt === undefined || this.lastReceiptPath === undefined) {
            context.ui?.notify?.("pi-verity: no current receipt · run /verity run", "warning");
            return;
        }
        context.ui?.notify?.(`pi-verity receipt · ${this.lastReceiptPath}\n${canonicalJson(this.lastReceipt)}`, "info");
    }
    notifyCurrent(context, stale) {
        if (this.lastReceipt === undefined) {
            context.ui?.notify?.("pi-verity: no current receipt · run /verity run", "warning");
            return;
        }
        if (stale) {
            context.ui?.notify?.("pi-verity ⚠ STALE · repository changed · /verity run", "warning");
            return;
        }
        context.ui?.notify?.(formatReceiptSummary(this.lastReceipt), receiptLevel(this.lastReceipt.verdict));
    }
    async handleCommand(args, context) {
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
                context.ui?.notify?.(`${formatDoctorReport(report)}\n${repairStatus()}`, report.ready ? "info" : "error");
            }
            catch (error) {
                context.ui?.notify?.(`pi-verity doctor failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            }
            return;
        }
        if (subcommand === "receipt") {
            this.notifyReceipt(context);
            return;
        }
        const stale = await this.receiptIsStale();
        if (subcommand === "why")
            this.notifyWhy(context, stale);
        else
            this.notifyCurrent(context, stale);
    }
}
export default function piVerity(pi) {
    new PiVerityRuntime(pi).register();
}
//# sourceMappingURL=index.js.map