import type { GitSnapshot, ProofReceipt } from "../core/types.js";
interface PiContext {
    cwd?: string;
    sessionManager?: {
        getSessionId?: () => string;
    };
    ui?: {
        notify?: (message: string, level?: "info" | "warning" | "error") => void;
        setStatus?: (key: string, value: string | undefined) => void;
    };
}
interface PiEvent {
    toolName?: string;
}
interface PiApi {
    on: (event: string, handler: (event: PiEvent, context: PiContext) => Promise<void> | void) => void;
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
}
export declare function formatReceiptSummary(receipt: ProofReceipt): string;
export declare function explainReceipt(receipt: ProofReceipt): string;
export declare function receiptMatchesState(receipt: ProofReceipt, current: GitSnapshot): boolean;
export declare function minimalFailureEvidence(receipt: ProofReceipt): string;
export default function piVerity(pi: PiApi): void;
export {};
