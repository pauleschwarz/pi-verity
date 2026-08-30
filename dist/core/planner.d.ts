export type ProofPlanKind = "none" | "docs_only" | "source" | "source+test" | "test" | "boundary";
export interface ChangeFacts {
    files: readonly string[];
    /** Existing suite usable for counterfactual when no test file changed. */
    hasExistingTests?: boolean;
    /** Exact pre-change workspace captured for counterfactual comparison. */
    hasExactBaseline?: boolean;
}
export interface ProofCheckPlan {
    selected: boolean;
    reason: string;
}
export interface ProofPlan {
    kind: ProofPlanKind;
    testFiles: string[];
    standard: ProofCheckPlan;
    counterfactual: ProofCheckPlan;
}
export declare function planProof(changeFacts: ChangeFacts): ProofPlan;
