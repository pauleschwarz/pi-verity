import type { GitSnapshot } from "./types.js";
export declare class NotGitRepositoryError extends Error {
    constructor(cwd: string);
}
export declare function findRepositoryRoot(cwd: string): Promise<string>;
export declare function captureGitSnapshot(root: string): Promise<GitSnapshot>;
export interface GitDiffStat {
    files: number;
    added: number;
    removed: number;
    primaryPath: string | null;
}
export declare function captureGitDiffStat(root: string): Promise<GitDiffStat>;
export declare function changedFiles(root: string): Promise<string[]>;
