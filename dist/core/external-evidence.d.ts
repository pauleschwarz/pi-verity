import type { ExternalEvidence } from "./types.js";
export declare const VISUAL_QA_PROVIDER = "visual-qa";
/**
 * Ingest a visual-qa `report.json` as bounded external evidence.
 *
 * Never launches a browser. Missing, unreadable, or malformed reports fail
 * closed. A PASS is recorded with `subject_bound` only when the caller proves
 * the browser subject was the candidate under verification.
 */
export declare function loadVisualQaEvidence(options: {
    reportPath: string;
    subjectBound?: boolean;
}): Promise<ExternalEvidence>;
