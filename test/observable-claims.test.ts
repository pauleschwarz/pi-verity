import assert from "node:assert/strict";
import { test } from "node:test";
import { extractObservableClaims } from "../src/core/observable-claims.js";

test("extracts present and absent quoted copy", () => {
  const claims = extractObservableClaims(
    'Please add "Buy now" and remove "Legacy checkout" on /pricing',
  );
  assert.deepEqual(
    claims.map((claim) => ({ kind: claim.kind, expected: claim.expected })),
    [
      { kind: "EXACT_TEXT_PRESENT", expected: "Buy now" },
      { kind: "EXACT_TEXT_ABSENT", expected: "Legacy checkout" },
    ],
  );
  assert.equal(claims[0]?.route_hint, "/pricing");
});

test("extracts style and numeric literals with target hints", () => {
  const claims = extractObservableClaims(
    "set the button background to #0f172a and width to 12px",
  );
  assert.ok(
    claims.some(
      (claim) => claim.kind === "STYLE_VALUE" && claim.expected === "#0f172a",
    ),
  );
  assert.ok(
    claims.some(
      (claim) => claim.kind === "NUMERIC_UI_VALUE" && claim.expected === "12px",
    ),
  );
});

test("subjective prompts yield zero claims", () => {
  assert.deepEqual(extractObservableClaims("make it prettier and more delightful"), []);
});

test("path-like quotes are never treated as product copy", () => {
  assert.deepEqual(
    extractObservableClaims('please add "src/index.ts" and show "https://example.com"'),
    [],
  );
});
