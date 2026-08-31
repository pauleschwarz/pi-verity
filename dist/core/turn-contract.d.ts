import type { ObservableClaim, ProbeHint } from "./types.js";
/**
 * A turn contract lives in session memory for the duration of one turn. It is
 * never written to disk, never configured by a file, and never survives the
 * process. Expected values come only from the user's own words.
 */
export interface TurnContract {
    claims: ObservableClaim[];
    hints: ProbeHint[];
    createdAt: number;
}
export declare function estimateTokens(text: string): number;
export declare function createTurnContract(input: string, now?: number): TurnContract;
export declare function isEmptyContract(contract: TurnContract | undefined): boolean;
/**
 * Record where the agent believes a claim can be observed.
 *
 * Location only. Any attempt to pass an expected value, a result or a verdict
 * is structurally impossible: `ProbeHint` has no field to carry one, and an
 * unknown claim id is rejected outright.
 */
export declare function addProbeHint(contract: TurnContract, hint: ProbeHint): boolean;
/**
 * Minimal context for the agent, or undefined when injection is not worth any
 * tokens at all. Emits nothing when there are no claims.
 */
export declare function renderContractContext(contract: TurnContract | undefined): string | undefined;
