/** Human labels for the four machine verdicts. JSON receipts stay unchanged. */
export const VERDICT_LABEL = {
    PASS: "Proven",
    PASS_WITH_WARNINGS: "Proven, with notes",
    UNPROVEN: "Not proven",
    FAIL: "Failed",
};
export const VERDICT_MARK = {
    PASS: "✓",
    PASS_WITH_WARNINGS: "⚠",
    UNPROVEN: "⚠",
    FAIL: "✗",
};
export function formatVerdictLine(verdict) {
    return `verity: ${VERDICT_LABEL[verdict]}`;
}
//# sourceMappingURL=display.js.map