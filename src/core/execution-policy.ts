import { sha256 } from "./hash.js";

export const EXECUTION_POLICY_ENV = "PI_VERITY_EXECUTION_POLICY";

export type ExecutionPolicyMode = "off" | "mutating" | "all";

export interface ExecutionPolicyConfiguration {
  mode: ExecutionPolicyMode;
  valid: boolean;
  configured_value: string | null;
  error: "INVALID_EXECUTION_POLICY" | null;
}

export type ExecutionPolicyDecision =
  | "ALLOW"
  | "DENY"
  | "BLOCK_NO_UI"
  | "BLOCK_INVALID_REQUEST"
  | "BLOCK_AUDIT_ERROR"
  | "NOT_REQUIRED";

export interface ExecutionPolicyEvent {
  created_at: string;
  session_id: string | null;
  tool_call_id: string;
  tool_name: string;
  request_hash: string;
  decision: ExecutionPolicyDecision;
  policy_mode: ExecutionPolicyMode;
  reason: string;
  request_summary?: string;
}

export interface ExecutionRequestIdentity {
  input_hash: string;
  request_hash: string;
}

const KNOWN_READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);
const SECRET_ASSIGNMENT =
  /\b(authorization|api[_-]?key|password|secret|token)(\s*[:=]\s*)([^\s,;]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;"']+/gi;

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function parseExecutionPolicy(value?: string): ExecutionPolicyConfiguration {
  if (value === undefined) {
    return { mode: "off", valid: true, configured_value: null, error: null };
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "off" || normalized === "mutating" || normalized === "all") {
    return {
      mode: normalized,
      valid: true,
      configured_value: value,
      error: null,
    };
  }
  return {
    mode: "all",
    valid: false,
    configured_value: value,
    error: "INVALID_EXECUTION_POLICY",
  };
}

export function isKnownReadOnlyTool(toolName: string): boolean {
  return KNOWN_READ_ONLY_TOOLS.has(toolName.trim().toLowerCase());
}

export function requiresExecutionApproval(
  mode: ExecutionPolicyMode,
  toolName: string,
): boolean {
  if (mode === "off") return false;
  if (mode === "all") return true;
  return !isKnownReadOnlyTool(toolName);
}

function canonicalValue(value: unknown, seen: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("tool input contains a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError(`tool input contains unsupported ${typeof value}`);
  }
  if (seen.has(value)) throw new TypeError("tool input contains a cycle");
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalValue(item, seen)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("tool input must contain only plain objects and arrays");
    }
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort(compareCodeUnits)
      .map((key) => `${JSON.stringify(key)}:${canonicalValue(record[key], seen)}`);
    return `{${entries.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalExecutionInput(input: unknown): string {
  return canonicalValue(input, new Set<object>());
}

export function fingerprintExecutionRequest(request: {
  sessionId?: string | null;
  toolCallId: string;
  toolName: string;
  input: unknown;
}): ExecutionRequestIdentity {
  const inputHash = sha256(canonicalExecutionInput(request.input));
  const requestHash = sha256(
    canonicalExecutionInput({
      input_hash: inputHash,
      session_id: request.sessionId ?? null,
      tool_call_id: request.toolCallId,
      tool_name: request.toolName,
    }),
  );
  return { input_hash: inputHash, request_hash: requestHash };
}

function freezeValue(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>)) {
    freezeValue(child, seen);
  }
  Object.freeze(value);
}

/** Lock a JSON-shaped input in place for callers that retain its reference. */
export function lockExecutionInput(input: unknown): void {
  canonicalExecutionInput(input);
  freezeValue(input, new Set<object>());
}

function redactSummary(value: string): string {
  return value
    .replace(SECRET_ASSIGNMENT, "$1$2[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
}

function bounded(value: string, limit = 180): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

export function summarizeExecutionRequest(
  toolName: string,
  input: Record<string, unknown>,
): string {
  const name = toolName.trim().toLowerCase();
  const path = typeof input.path === "string" ? input.path : undefined;
  const command = typeof input.command === "string" ? input.command : undefined;
  if ((name === "bash" || name === "powershell") && command !== undefined) {
    return bounded(redactSummary(command));
  }
  if (path !== undefined) return bounded(redactSummary(path));
  if (name === "apply_patch") return "patch payload (content not displayed)";
  const keys = Object.keys(input).sort(compareCodeUnits).slice(0, 8);
  return keys.length === 0 ? "empty request" : `input fields: ${keys.join(", ")}`;
}

export function formatExecutionPolicyEvent(event: ExecutionPolicyEvent): string {
  const summary =
    event.request_summary === undefined ? "" : ` · ${event.request_summary}`;
  return `${event.decision} · ${event.tool_name}${summary}`;
}
