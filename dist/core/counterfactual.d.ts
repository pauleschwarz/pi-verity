import type { CounterfactualClassification, CounterfactualEvidence, PatchPolarity, VerificationCommand } from "./types.js";
import { type CounterfactualBaseline } from "./workspace.js";
export declare function isTestPath(path: string): boolean;
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
export declare function patchPolarity(classification: CounterfactualClassification): PatchPolarity;
export declare function runCounterfactual(options: CounterfactualOptions): Promise<CounterfactualEvidence | null>;
