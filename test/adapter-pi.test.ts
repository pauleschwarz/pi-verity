import assert from "node:assert/strict";
import { test } from "node:test";
import {
  explainReceipt,
  formatReceiptSummary,
  minimalFailureEvidence,
  receiptMatchesState,
} from "../src/adapter-pi/index.js";
import type { ProofReceipt } from "../src/core/types.js";

function receipt(overrides: Partial<ProofReceipt> = {}): ProofReceipt {
  return {
    schema_version: 3,
    task_id: "task-1",
    session_id: "session-1",
    repository_root: "/repo",
    created_at: "2026-08-28T00:00:00.000Z",
    baseline: {
      sha: "abc",
      status_hash: "status",
      state_hash: "state",
      dirty: false,
      status_porcelain_v2: "",
    },
    final_diff_hash: "diff",
    changed_files: ["src/index.ts"],
    repository_changed_since_baseline: true,
    verification_commands: [
      {
        source: "package.json",
        kind: "test",
        command: ["npm", "test"],
        cwd: "/tmp/repo",
        exit_code: 0,
        duration_ms: 1800,
        stdout: "",
        stderr: "",
        stdout_truncated: false,
        stderr_truncated: false,
        timed_out: false,
        cancelled: false,
      },
    ],
    counterfactual: null,
    scope_integrity: {
      available: true,
      baseline_source: "exact_workspace",
      analyzed_files: ["src/index.ts"],
      task_touched: ["src/index.ts"],
      signals: [],
      reason: null,
    },
    warnings: [],
    unverified_dimensions: [],
    verdict: "PASS",
    ...overrides,
  };
}

test("successful summary is concise and deterministic", () => {
  assert.equal(formatReceiptSummary(receipt()), "verity ✓ PASS · 1 file · 1800ms");
  assert.equal(
    formatReceiptSummary(receipt(), {
      files: 2,
      added: 18,
      removed: 3,
      primaryPath: "src/index.ts",
    }),
    "verity ✓ PASS · 2 files +18/-3 · 1800ms",
  );
});

test("why explains selected checks and every scope signal", () => {
  const value = receipt({
    scope_integrity: {
      available: true,
      baseline_source: "exact_workspace",
      analyzed_files: ["package.json"],
      task_touched: ["package.json"],
      reason: null,
      signals: [
        {
          severity: "WARNING",
          code: "SCOPE_DEPENDENCY_ADDED",
          file: "package.json",
          observed: "dependency added: example@1.0.0",
          why: "Dependency surface changed.",
          evidence: ["dependencies.example: absent -> 1.0.0"],
        },
      ],
    },
    verdict: "PASS_WITH_WARNINGS",
  });

  const explanation = explainReceipt(value);
  assert.match(explanation, /npm test · selected from package\.json \(test\) · PASS/);
  assert.match(explanation, /counterfactual · not selected/);
  assert.match(explanation, /SCOPE_DEPENDENCY_ADDED/);
  assert.match(explanation, /dependencies\.example: absent -> 1\.0\.0/);
});

test("receipt state identity detects stale proof", () => {
  const value = receipt();
  assert.equal(
    receiptMatchesState(value, {
      sha: "abc",
      status_hash: "status",
      state_hash: "diff",
      dirty: true,
      status_porcelain_v2: "1 .M N... src/index.ts",
    }),
    true,
  );
  assert.equal(
    receiptMatchesState(value, {
      sha: "abc",
      status_hash: "new-status",
      state_hash: "new-diff",
      dirty: true,
      status_porcelain_v2: "1 .M N... src/index.ts",
    }),
    false,
  );
});

test("failure evidence is bounded and redacts common secret assignments", () => {
  const passingCommand = receipt().verification_commands[0];
  assert.ok(passingCommand);
  const failed = receipt({
    verification_commands: [
      {
        ...passingCommand,
        exit_code: 1,
        stderr: `targeted assertion failed\napi_key=super-secret-value`,
      },
    ],
    verdict: "FAIL",
  });

  assert.equal(
    formatReceiptSummary(failed),
    "verity ✗ FAIL · src/index.ts\nnpm test failed\n/verity why",
  );
  const evidence = minimalFailureEvidence(failed);
  assert.match(evidence, /npm test · FAIL \(exit 1\)/);
  assert.match(evidence, /targeted assertion failed/);
  assert.match(evidence, /api_key=\[REDACTED\]/);
  assert.doesNotMatch(evidence, /super-secret-value/);
  assert.ok(evidence.length < 1200);
});
