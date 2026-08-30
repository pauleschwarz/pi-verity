import assert from "node:assert/strict";
import test from "node:test";
import { planProof } from "../src/core/planner.js";

test("docs-only changes select no proof command", () => {
  const plan = planProof({ files: ["README.md", "docs/GETTING_STARTED.md"] });
  assert.equal(plan.kind, "docs_only");
  assert.equal(plan.standard.selected, false);
  assert.equal(plan.counterfactual.selected, false);
});

test("source changes select standard verification only", () => {
  const plan = planProof({ files: ["src/core/verifier.ts"] });
  assert.equal(plan.kind, "source");
  assert.equal(plan.standard.selected, true);
  assert.equal(plan.counterfactual.selected, false);
});

test("source changes use an existing test suite for counterfactual proof", () => {
  const plan = planProof({
    files: ["src/core/verifier.ts"],
    hasExistingTests: true,
  });
  assert.equal(plan.kind, "source");
  assert.equal(plan.counterfactual.selected, true);
});

test("source and test changes select both proof dimensions", () => {
  const plan = planProof({
    files: ["src/core/verifier.ts", "test/verifier.test.ts"],
  });
  assert.equal(plan.kind, "source+test");
  assert.equal(plan.standard.selected, true);
  assert.equal(plan.counterfactual.selected, true);
});

test("verification-boundary changes select standard verification", () => {
  const plan = planProof({ files: ["package.json"] });
  assert.equal(plan.kind, "boundary");
  assert.equal(plan.standard.selected, true);
  assert.equal(plan.counterfactual.selected, false);
});

test("empty changes select no proof", () => {
  const plan = planProof({ files: [] });
  assert.equal(plan.kind, "none");
  assert.equal(plan.standard.selected, false);
  assert.equal(plan.counterfactual.selected, false);
});
