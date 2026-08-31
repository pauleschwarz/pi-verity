import type { EffectEvidence, EffectObservation, ObservableClaim, ProbeHint } from "./types.js";
/**
 * A runtime sensor answers exactly one tiny question about an already-running
 * application. Verity never starts, owns or installs a runtime: an
 * implementation is injected only when one is genuinely already available.
 */
export interface RuntimeSensor {
    observe(claim: ObservableClaim, hint: ProbeHint | undefined, signal?: AbortSignal): Promise<string | null>;
}
export interface EffectProofOptions {
    root: string;
    claims: readonly ObservableClaim[];
    hints?: readonly ProbeHint[];
    /** Only supplied when a usable runtime already exists. */
    runtime?: RuntimeSensor;
    signal?: AbortSignal;
}
export declare const EMPTY_EFFECT_EVIDENCE: EffectEvidence;
export declare function proveEffects(options: EffectProofOptions): Promise<EffectEvidence>;
export declare function contradictedEffects(evidence: EffectEvidence): EffectObservation[];
export declare function uncheckedEffects(evidence: EffectEvidence): EffectObservation[];
