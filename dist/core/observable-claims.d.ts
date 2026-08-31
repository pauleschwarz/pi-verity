import type { ObservableClaim } from "./types.js";
/**
 * Extract observable claims from raw user input.
 *
 * Returns an empty array for subjective requests ("make it prettier"), for
 * unquoted copy changes, and for anything that no deterministic sensor could
 * falsify. Empty output is the correct, common case.
 */
export declare function extractObservableClaims(input: string): ObservableClaim[];
