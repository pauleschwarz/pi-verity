export declare const EXECUTION_POLICY_ENV = "PI_VERITY_EXECUTION_POLICY";
export type ExecutionPolicyMode = "off" | "mutating" | "all";
export interface ExecutionPolicyConfiguration {
    mode: ExecutionPolicyMode;
    valid: boolean;
    configured_value: string | null;
    error: "INVALID_EXECUTION_POLICY" | null;
}
export type ExecutionPolicyDecision = "ALLOW" | "DENY" | "BLOCK_NO_UI" | "BLOCK_INVALID_REQUEST" | "BLOCK_AUDIT_ERROR" | "NOT_REQUIRED";
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
export declare function parseExecutionPolicy(value?: string): ExecutionPolicyConfiguration;
export declare function isKnownReadOnlyTool(toolName: string): boolean;
export declare function requiresExecutionApproval(mode: ExecutionPolicyMode, toolName: string): boolean;
export declare function canonicalExecutionInput(input: unknown): string;
export declare function fingerprintExecutionRequest(request: {
    sessionId?: string | null;
    toolCallId: string;
    toolName: string;
    input: unknown;
}): ExecutionRequestIdentity;
/** Lock a JSON-shaped input in place for callers that retain its reference. */
export declare function lockExecutionInput(input: unknown): void;
export declare function summarizeExecutionRequest(toolName: string, input: Record<string, unknown>): string;
export declare function formatExecutionPolicyEvent(event: ExecutionPolicyEvent): string;
