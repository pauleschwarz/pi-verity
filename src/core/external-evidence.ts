import { readFile } from "node:fs/promises";
import { sha256 } from "./hash.js";
import type { ExternalEvidence } from "./types.js";

export const VISUAL_QA_PROVIDER = "visual-qa";

interface VisualQaReport {
  verdict?: unknown;
  complete?: unknown;
  run_id?: unknown;
  coverage?: { limit_reason?: unknown } | null;
  issue_count?: unknown;
  issues?: unknown;
}

function issueCount(report: VisualQaReport): number | null {
  if (typeof report.issue_count === "number" && Number.isFinite(report.issue_count))
    return Math.max(0, Math.trunc(report.issue_count));
  if (Array.isArray(report.issues)) return report.issues.length;
  return null;
}

function unavailable(detail: string, reportPath: string): ExternalEvidence {
  return {
    provider: VISUAL_QA_PROVIDER,
    status: "UNAVAILABLE",
    subject_bound: false,
    run_id: null,
    report_hash: null,
    report_path: reportPath,
    issue_count: null,
    detail,
  };
}

function malformed(
  detail: string,
  reportPath: string,
  reportHash: string | null,
): ExternalEvidence {
  return {
    provider: VISUAL_QA_PROVIDER,
    status: "MALFORMED",
    subject_bound: false,
    run_id: null,
    report_hash: reportHash,
    report_path: reportPath,
    issue_count: null,
    detail,
  };
}

/**
 * Ingest a visual-qa `report.json` as bounded external evidence.
 *
 * Never launches a browser. Missing, unreadable, or malformed reports fail
 * closed. A PASS is recorded with `subject_bound` only when the caller proves
 * the browser subject was the candidate under verification.
 */
export async function loadVisualQaEvidence(options: {
  reportPath: string;
  subjectBound?: boolean;
}): Promise<ExternalEvidence> {
  const reportPath = options.reportPath;
  let raw: Buffer;
  try {
    raw = await readFile(reportPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return unavailable("visual-qa report not found", reportPath);
    return unavailable(
      `visual-qa report unreadable: ${error instanceof Error ? error.message : "unknown error"}`,
      reportPath,
    );
  }

  const reportHash = sha256(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    return malformed("visual-qa report is not valid JSON", reportPath, reportHash);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    return malformed("visual-qa report is not an object", reportPath, reportHash);

  const report = parsed as VisualQaReport;
  const runId = typeof report.run_id === "string" ? report.run_id : null;
  const complete = report.complete;
  const verdict = report.verdict;
  const limitReason =
    typeof report.coverage?.limit_reason === "string"
      ? report.coverage.limit_reason
      : null;

  if (verdict !== "PASS" && verdict !== "FAIL" && verdict !== "UNPROVEN")
    return malformed(
      "visual-qa report is missing a known verdict",
      reportPath,
      reportHash,
    );

  if (verdict === "FAIL") {
    return {
      provider: VISUAL_QA_PROVIDER,
      status: "FAIL",
      subject_bound: options.subjectBound === true,
      run_id: runId,
      report_hash: reportHash,
      report_path: reportPath,
      issue_count: issueCount(report),
      detail: "visual-qa reported FAIL",
    };
  }

  if (complete === false || verdict === "UNPROVEN" || limitReason !== null) {
    return {
      provider: VISUAL_QA_PROVIDER,
      status: "INCOMPLETE",
      subject_bound: false,
      run_id: runId,
      report_hash: reportHash,
      report_path: reportPath,
      issue_count: issueCount(report),
      detail:
        limitReason === null
          ? "visual-qa coverage was incomplete"
          : `visual-qa coverage incomplete: ${limitReason}`,
    };
  }

  return {
    provider: VISUAL_QA_PROVIDER,
    status: "PASS",
    subject_bound: options.subjectBound === true,
    run_id: runId,
    report_hash: reportHash,
    report_path: reportPath,
    issue_count: issueCount(report),
    detail:
      options.subjectBound === true
        ? "visual-qa PASS with bound subject"
        : "visual-qa PASS without a bound subject",
  };
}
