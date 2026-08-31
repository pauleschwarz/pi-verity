/**
 * Deterministic extraction of observable claims from the raw user request.
 *
 * Hard rule: no model call, no semantic guessing. Only high-confidence literals
 * that a mechanical sensor could later falsify are extracted. Anything else
 * yields no claim, so subjective requests stay subjective (see LIMITATIONS.md).
 */
const MAX_CLAIMS = 8;
const MAX_LITERAL_LENGTH = 120;
const MAX_INPUT_LENGTH = 8000;
/** Quoted literal: "x", 'x' or `x`. Bounded body prevents catastrophic backtracking. */
const QUOTED = /"([^"\n]{1,120})"|'([^'\n]{1,120})'|`([^`\n]{1,120})`/g;
/** #rgb / #rrggbb colour literal. */
const HEX_COLOUR = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;
/** CSS numeric with an explicit unit. Unitless numbers are never a claim. */
const CSS_NUMERIC = /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)\b/g;
/** Route literal: /pricing, /checkout/step-2. Excludes file paths with a dot. */
const ROUTE = /(?:^|\s)(\/[a-z0-9][a-z0-9\-_/]*)(?=$|[\s.,;:)])/gi;
const REMOVE_VERB = /\b(?:remove|delete|drop|strip|get\s+rid\s+of|eliminate|take\s+out|kill)\b/i;
const ADD_VERB = /\b(?:add|show|display|render|insert|say|write|include|put|set\s+the\s+text|change\s+(?:it\s+)?to)\b/i;
const HIDE_VERB = /\b(?:hide|conceal)\b/i;
const SHOW_VERB = /\b(?:show|reveal|unhide|display)\b/i;
/** Path-ish or code-ish literals are never product copy. */
const NON_COPY_LITERAL = /^(?:[./~]|https?:)|\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|vue|svelte|py|go|rs|ya?ml|toml|lock)$|^[a-z0-9_-]+\/[a-z0-9_./-]+$/i;
function normaliseWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
/** Text preceding a match, used to decide the requested polarity. */
function precedingContext(text, index) {
    return text.slice(Math.max(0, index - 80), index);
}
function isCopyLiteral(value) {
    if (value.length === 0 || value.length > MAX_LITERAL_LENGTH)
        return false;
    if (NON_COPY_LITERAL.test(value))
        return false;
    // A bare CSS/colour token is handled by the style extractors, not as copy.
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))
        return false;
    if (/^\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/i.test(value))
        return false;
    return true;
}
function firstRoute(text) {
    ROUTE.lastIndex = 0;
    const match = ROUTE.exec(text);
    const route = match?.[1];
    if (route === undefined)
        return undefined;
    // A lone "/" carries no location information.
    return route === "/" ? undefined : route;
}
/** Words near a style literal that describe the element the user meant. */
function targetDescription(context) {
    const match = context.match(/\b(?:the\s+)?([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})\s+(?:background|colour|color|text|width|height|size|to|should)\b/i);
    const described = match?.[1];
    if (described === undefined)
        return undefined;
    const cleaned = normaliseWhitespace(described);
    return cleaned.length === 0 ? undefined : cleaned;
}
function quotedTextClaims(text) {
    const drafts = [];
    QUOTED.lastIndex = 0;
    for (const match of text.matchAll(QUOTED)) {
        const literal = match[1] ?? match[2] ?? match[3] ?? "";
        const value = normaliseWhitespace(literal);
        if (!isCopyLiteral(value))
            continue;
        const context = precedingContext(text, match.index ?? 0);
        // Polarity must be explicit. An unqualified quote is not a claim.
        if (REMOVE_VERB.test(context)) {
            drafts.push({ kind: "EXACT_TEXT_ABSENT", expected: value });
        }
        else if (ADD_VERB.test(context)) {
            drafts.push({ kind: "EXACT_TEXT_PRESENT", expected: value });
        }
    }
    return drafts;
}
function styleClaims(text) {
    const drafts = [];
    for (const match of text.matchAll(HEX_COLOUR)) {
        const context = precedingContext(text, match.index ?? 0);
        const described = targetDescription(context);
        const draft = {
            kind: "STYLE_VALUE",
            expected: match[0].toLowerCase(),
        };
        if (described !== undefined)
            draft.targetDescription = described;
        drafts.push(draft);
    }
    for (const match of text.matchAll(CSS_NUMERIC)) {
        const context = precedingContext(text, match.index ?? 0);
        const described = targetDescription(context);
        const draft = {
            kind: "NUMERIC_UI_VALUE",
            expected: match[0].toLowerCase(),
        };
        if (described !== undefined)
            draft.targetDescription = described;
        drafts.push(draft);
    }
    return drafts;
}
function visibilityClaims(text) {
    const drafts = [];
    // Only an explicit hide/show of a *named* element counts. "hide it" does not.
    const hide = text.match(/\b(?:hide|conceal)\s+the\s+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})\b/i);
    if (hide?.[1] !== undefined && HIDE_VERB.test(text)) {
        drafts.push({
            kind: "VISIBILITY",
            expected: "false",
            targetDescription: normaliseWhitespace(hide[1]),
        });
    }
    const show = text.match(/\b(?:reveal|unhide)\s+the\s+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2})\b/i);
    if (show?.[1] !== undefined && SHOW_VERB.test(text)) {
        drafts.push({
            kind: "VISIBILITY",
            expected: "true",
            targetDescription: normaliseWhitespace(show[1]),
        });
    }
    return drafts;
}
/**
 * Extract observable claims from raw user input.
 *
 * Returns an empty array for subjective requests ("make it prettier"), for
 * unquoted copy changes, and for anything that no deterministic sensor could
 * falsify. Empty output is the correct, common case.
 */
export function extractObservableClaims(input) {
    if (typeof input !== "string" || input.length === 0)
        return [];
    const text = input.slice(0, MAX_INPUT_LENGTH);
    const route = firstRoute(text);
    const drafts = [
        ...quotedTextClaims(text),
        ...styleClaims(text),
        ...visibilityClaims(text),
    ];
    const claims = [];
    const seen = new Set();
    for (const draft of drafts) {
        const key = `${draft.kind}:${draft.expected}:${draft.targetDescription ?? ""}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const claim = {
            id: `claim-${claims.length + 1}`,
            kind: draft.kind,
            expected: draft.expected,
        };
        if (draft.targetDescription !== undefined) {
            claim.target_description = draft.targetDescription;
        }
        if (route !== undefined)
            claim.route_hint = route;
        claims.push(claim);
        if (claims.length >= MAX_CLAIMS)
            break;
    }
    return claims;
}
//# sourceMappingURL=observable-claims.js.map