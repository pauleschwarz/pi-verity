import type { Verdict } from "./types.js";

/** Human labels for the four machine verdicts. JSON receipts stay unchanged. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  PASS: "Proven",
  PASS_WITH_WARNINGS: "Proven, with notes",
  UNPROVEN: "Not proven",
  FAIL: "Failed",
};

export const VERDICT_MARK: Record<Verdict, string> = {
  PASS: "✓",
  PASS_WITH_WARNINGS: "⚠",
  UNPROVEN: "⚠",
  FAIL: "✗",
};

export function formatVerdictLine(verdict: Verdict): string {
  return `verity: ${VERDICT_LABEL[verdict]}`;
}
