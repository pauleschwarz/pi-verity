## Problem

What concrete failure mode, missing evidence, or bug does this change address?

## Approach

What changed and why is this the smallest suitable mechanism?

## Evidence

- [ ] tests added/updated
- [ ] fixture added/updated where applicable
- [ ] typecheck/lint passes
- [ ] relevant integration test passes

Provide concise proof.

## Product invariants

- [ ] no hidden LLM call
- [ ] no provider-specific proof semantics
- [ ] no silent network behavior
- [ ] no mutation of the user's original worktree beyond documented behavior
- [ ] uncertainty is not converted into PASS

## Security impact

Describe process/filesystem/network/configuration implications.

## Performance impact

Describe added default-path work and measured overhead where relevant.

## Receipt/schema impact

Does this change ProofReceipt semantics or schema?

## Documentation

- [ ] README/docs updated where required
- [ ] examples remain valid
