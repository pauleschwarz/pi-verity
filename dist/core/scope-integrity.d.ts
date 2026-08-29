import type { ScopeIntegrityEvidence } from "./types.js";
export interface ScopeIntegrityOptions {
    root: string;
    changedFiles: string[];
    baselineDirectory?: string;
    baselineRef?: string;
    baselineDirty?: boolean;
}
export declare function analyzeScopeIntegrity(options: ScopeIntegrityOptions): Promise<ScopeIntegrityEvidence>;
