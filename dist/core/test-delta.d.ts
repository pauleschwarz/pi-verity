import type { TestDelta } from "./types.js";
export interface TestDeltaOptions {
    root: string;
    changedFiles: readonly string[];
    /** Exact pre-change workspace, when one was captured. Preferred baseline. */
    baselineDirectory?: string;
    /** Clean Git baseline reference, used when no workspace copy exists. */
    baselineRef?: string;
    baselineDirty?: boolean;
}
export declare const EMPTY_TEST_DELTA: TestDelta;
/**
 * Mechanical summary of how test evidence changed this turn.
 *
 * Reports facts only. It never claims a test became "better" or "worse"; it
 * reports that assertions were added or removed, and marks `weakened` when the
 * change strictly reduced mechanical evidence.
 */
export declare function summarizeTestDelta(options: TestDeltaOptions): Promise<TestDelta>;
/** Compact, factual rendering. Empty string when there is nothing to report. */
export declare function formatTestDelta(delta: TestDelta): string;
