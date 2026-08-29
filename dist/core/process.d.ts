import type { CommandResult, VerificationCommand } from "./types.js";
export interface RunOptions {
    cwd: string;
    timeoutMs: number;
    maxOutputBytes: number;
    denyNetwork?: boolean;
    signal?: AbortSignal;
}
export declare function runCommand(command: VerificationCommand, options: RunOptions): Promise<CommandResult>;
