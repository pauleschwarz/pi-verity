import type { Verdict } from "./types.js";
/** Human labels for the four machine verdicts. JSON receipts stay unchanged. */
export declare const VERDICT_LABEL: Record<Verdict, string>;
export declare const VERDICT_MARK: Record<Verdict, string>;
export declare function formatVerdictLine(verdict: Verdict): string;
