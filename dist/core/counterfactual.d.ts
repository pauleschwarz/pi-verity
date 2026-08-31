import type { CounterfactualClassification, CounterfactualEvidence, PatchPolarity, VerificationCommand } from "./types.js";
import { type CounterfactualBaseline } from "./workspace.js";
export declare function isTestPath(path: string): boolean;
/**
 * Shared mechanical detectors. Exported so the test-delta summary reuses this
 * single engine instead of maintaining a parallel set of rules.
 */
export declare const SKIP: RegExp;
export declare const ASSERTION: RegExp;
export declare const SUPPRESSION: RegExp;
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
export declare function count(pattern: RegExp, value: string): number;
export declare function patchPolarity(classification: CounterfactualClassification): PatchPolarity;
export declare function runCounterfactual(options: CounterfactualOptions): Promise<CounterfactualEvidence | null>;
