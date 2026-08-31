import { type GitDiffStat } from "../core/git.js";
import type { GitSnapshot, ProofReceipt } from "../core/types.js";
type VerityUiStateKind = "BLOCKED" | "FAILED" | "APPROVAL_REQUIRED" | "VERIFYING" | "UNPROVEN" | "WARNING" | "PROVEN" | "CHANGE_PENDING" | "OBSERVING";
export interface VerityUiState {
    kind: VerityUiStateKind;
    detail?: string;
}
type VerityThemeColor = "accent" | "success" | "warning" | "error" | "dim";
interface VerityTheme {
    fg: (color: VerityThemeColor, text: string) => string;
}
export declare function transitionVerityStatus(current: VerityUiState | undefined, next: VerityUiState, recover?: boolean): VerityUiState;
export declare function renderVerityStatus(state: VerityUiState, theme?: VerityTheme): string;
export declare function setVerityStatus(context: PiContext, state: VerityUiState): void;
interface PiContext {
    cwd?: string;
    hasUI?: boolean;
    sessionManager?: {
        getSessionId?: () => string;
    };
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
interface PiToolResult {
    content: Array<{
        type: "text";
        text: string;
    }>;
    details: unknown;
}
interface PiToolSchema {
    type: string;
    additionalProperties?: boolean;
    properties?: Record<string, PiToolSchema>;
    items?: PiToolSchema;
    required?: string[];
}
type PiToolExecute = (toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal, onUpdate?: (update: unknown) => void, ctx?: unknown) => Promise<PiToolResult>;
interface PiToolDefinition {
    name: string;
    label: string;
    description: string;
    parameters: PiToolSchema;
    execute: PiToolExecute;
}
interface PiApi {
    on: (event: string, handler: (event: PiEvent, context: PiContext) => Promise<unknown> | unknown) => void;
    appendEntry: (customType: string, data?: unknown) => void;
    sendMessage: (message: {
        customType: string;
        content: string;
        display?: boolean;
        details?: unknown;
    }, options?: {
        triggerTurn?: boolean;
        deliverAs?: "steer" | "followUp" | "nextTurn";
    }) => void;
    registerCommand: (name: string, definition: {
        description: string;
        handler: (args: string, context: PiContext) => Promise<void>;
    }) => void;
    registerTool?: <TParams>(tool: PiToolDefinition & {
        parameters: TParams;
    }) => void;
}
export declare function configuredRepairLimit(value?: string | undefined): number;
export declare function formatReceiptSummary(receipt: ProofReceipt, diff?: GitDiffStat | null): string;
export declare function explainReceipt(receipt: ProofReceipt): string;
export declare function receiptMatchesState(receipt: ProofReceipt, current: GitSnapshot): boolean;
export declare function minimalFailureEvidence(receipt: ProofReceipt): string;
export default function piVerity(pi: PiApi): void;
export {};
