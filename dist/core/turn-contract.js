import { extractObservableClaims } from "./observable-claims.js";
/** Rough 4-chars-per-token budget guard for injected context. */
const HARD_TOKEN_LIMIT = 200;
const CHARS_PER_TOKEN = 4;
export function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
export function createTurnContract(input, now = Date.now()) {
    return { claims: extractObservableClaims(input), hints: [], createdAt: now };
}
export function isEmptyContract(contract) {
    return contract === undefined || contract.claims.length === 0;
}
/**
 * Record where the agent believes a claim can be observed.
 *
 * Location only. Any attempt to pass an expected value, a result or a verdict
 * is structurally impossible: `ProbeHint` has no field to carry one, and an
 * unknown claim id is rejected outright.
 */
export function addProbeHint(contract, hint) {
    if (!contract.claims.some((claim) => claim.id === hint.claim_id))
        return false;
    const sanitized = { claim_id: hint.claim_id };
    if (hint.route !== undefined && hint.route.length > 0)
        sanitized.route = hint.route.slice(0, 200);
    if (hint.selector !== undefined && hint.selector.length > 0)
        sanitized.selector = hint.selector.slice(0, 200);
    if (hint.file !== undefined && hint.file.length > 0)
        sanitized.file = hint.file.slice(0, 400);
    const existing = contract.hints.findIndex((item) => item.claim_id === hint.claim_id);
    if (existing === -1)
        contract.hints.push(sanitized);
    else
        contract.hints[existing] = sanitized;
    return true;
}
function describeClaim(claim) {
    const target = claim.target_description === undefined ? "" : ` (${claim.target_description})`;
    switch (claim.kind) {
        case "EXACT_TEXT_ABSENT":
            return `${claim.id}: "${claim.expected}" must be gone${target}`;
        case "EXACT_TEXT_PRESENT":
            return `${claim.id}: "${claim.expected}" must be present${target}`;
        case "VISIBILITY":
            return `${claim.id}: ${claim.target_description ?? "element"} visible=${claim.expected}`;
        default:
            return `${claim.id}: ${claim.expected}${target}`;
    }
}
/**
 * Minimal context for the agent, or undefined when injection is not worth any
 * tokens at all. Emits nothing when there are no claims.
 */
export function renderContractContext(contract) {
    if (contract === undefined || contract.claims.length === 0)
        return undefined;
    const lines = contract.claims.slice(0, 5).map(describeClaim);
    let text = [
        "Verity turn contract (from the user's own words):",
        ...lines.map((line) => `- ${line}`),
        "Call verity_check before claiming done.",
    ].join("\n");
    while (estimateTokens(text) > HARD_TOKEN_LIMIT && lines.length > 1) {
        lines.pop();
        text = [
            "Verity turn contract (from the user's own words):",
            ...lines.map((line) => `- ${line}`),
            "Call verity_check before claiming done.",
        ].join("\n");
    }
    if (estimateTokens(text) > HARD_TOKEN_LIMIT)
        return undefined;
    return text;
}
//# sourceMappingURL=turn-contract.js.map