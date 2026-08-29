export declare const DEFAULT_MAX_WORKSPACE_BYTES: number;
export interface IsolatedWorkspace {
    directory: string;
    size_bytes: number;
    cleanup: () => Promise<void>;
}
export declare function createIsolatedWorkspace(source: string, maxBytes?: number, prefix?: string): Promise<IsolatedWorkspace>;
export interface CounterfactualBaseline {
    directory: string;
    repository_root: string;
    size_bytes: number;
    cleanup: () => Promise<void>;
}
export declare function captureCounterfactualBaseline(repositoryRoot: string, maxBytes?: number): Promise<CounterfactualBaseline>;
