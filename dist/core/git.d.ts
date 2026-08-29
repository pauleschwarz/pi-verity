import type { GitSnapshot } from "./types.js";
export declare class NotGitRepositoryError extends Error {
    constructor(cwd: string);
}
export declare function findRepositoryRoot(cwd: string): Promise<string>;
export declare function captureGitSnapshot(root: string): Promise<GitSnapshot>;
export declare function changedFiles(root: string): Promise<string[]>;
