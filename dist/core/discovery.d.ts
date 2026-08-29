import type { VerificationCommand } from "./types.js";
export interface DiscoveryResult {
    commands: VerificationCommand[];
    warnings: string[];
}
export declare function discoverVerification(root: string): Promise<DiscoveryResult>;
