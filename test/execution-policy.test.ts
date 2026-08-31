import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalExecutionInput,
  fingerprintExecutionRequest,
  lockExecutionInput,
  parseExecutionPolicy,
  requiresExecutionApproval,
  summarizeExecutionRequest,
} from "../src/core/execution-policy.js";

test("execution policy parser accepts off, mutating, and all", () => {
  assert.deepEqual(parseExecutionPolicy(undefined), {
    mode: "off",
    valid: true,
    configured_value: null,
    error: null,
  });
  assert.equal(parseExecutionPolicy("off").mode, "off");
  assert.equal(parseExecutionPolicy(" MUTATING ").mode, "mutating");
  assert.equal(parseExecutionPolicy("ALL").mode, "all");
});

test("invalid execution policy is explicit and fails safe to all", () => {
  assert.deepEqual(parseExecutionPolicy("sometimes"), {
    mode: "all",
    valid: false,
    configured_value: "sometimes",
    error: "INVALID_EXECUTION_POLICY",
  });
  assert.equal(parseExecutionPolicy("").mode, "all");
  assert.equal(parseExecutionPolicy("").valid, false);
});

test("mutating policy only exempts known read-only tools", () => {
  for (const name of ["read", "grep", "find", "ls"]) {
    assert.equal(requiresExecutionApproval("mutating", name), false, name);
  }
  for (const name of ["bash", "write", "edit", "apply_patch", "custom_tool"]) {
    assert.equal(requiresExecutionApproval("mutating", name), true, name);
  }
});

test("all policy gates every tool and off gates none", () => {
  for (const name of ["read", "grep", "bash", "custom_tool"]) {
    assert.equal(requiresExecutionApproval("all", name), true, name);
    assert.equal(requiresExecutionApproval("off", name), false, name);
  }
});

test("request fingerprint is stable across object key order", () => {
  const left = fingerprintExecutionRequest({
    sessionId: "session-1",
    toolCallId: "call-1",
    toolName: "bash",
    input: { command: "npm test", options: { timeout: 10, quiet: true } },
  });
  const right = fingerprintExecutionRequest({
    sessionId: "session-1",
    toolCallId: "call-1",
    toolName: "bash",
    input: { options: { quiet: true, timeout: 10 }, command: "npm test" },
  });
  assert.deepEqual(left, right);
  assert.equal(
    canonicalExecutionInput({ z: 1, a: [true, null] }),
    '{"a":[true,null],"z":1}',
  );
});

test("request fingerprint changes with input, command, tool, or call identity", () => {
  const hash = (
    overrides: Partial<Parameters<typeof fingerprintExecutionRequest>[0]>,
  ) =>
    fingerprintExecutionRequest({
      sessionId: "session-1",
      toolCallId: "call-1",
      toolName: "bash",
      input: { command: "npm test" },
      ...overrides,
    }).request_hash;
  const original = hash({});
  assert.notEqual(original, hash({ input: { command: "npm run verify" } }));
  assert.notEqual(original, hash({ toolName: "write" }));
  assert.notEqual(original, hash({ toolCallId: "call-2" }));
  assert.notEqual(original, hash({ sessionId: "session-2" }));
});

test("approved JSON input can be locked against later in-place mutation", () => {
  const input = { command: "touch allowed", options: { cwd: "/tmp" } };
  lockExecutionInput(input);
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.options), true);
  assert.throws(() => {
    input.command = "touch forbidden";
  }, TypeError);
  assert.equal(input.command, "touch allowed");
});

test("non-JSON inputs fail explicitly instead of receiving a fingerprint", () => {
  assert.throws(
    () =>
      fingerprintExecutionRequest({
        toolCallId: "call-1",
        toolName: "custom",
        input: { callback: () => undefined },
      }),
    /unsupported function/,
  );
  assert.throws(() => canonicalExecutionInput({ value: Number.NaN }), /non-finite/);
});

test("request summaries are bounded and redact common secrets", () => {
  const summary = summarizeExecutionRequest("bash", {
    command: `curl -H "Authorization=secret-token" https://example.invalid ${"x".repeat(300)}`,
  });
  assert.doesNotMatch(summary, /secret-token/);
  assert.ok(summary.length <= 180);
  assert.equal(
    summarizeExecutionRequest("write", { path: "src/index.ts", content: "private" }),
    "src/index.ts",
  );
  assert.equal(
    summarizeExecutionRequest("custom", { token: "secret", payload: "hidden" }),
    "input fields: payload, token",
  );
});
