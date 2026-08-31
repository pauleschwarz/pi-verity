# Release evidence v0.1.5

**Date:** 2026-08-30

> Historical evidence for the immutable v0.1.5 tag. It does not describe the
> unreleased schema-v4 work in the current working tree.

v0.1.5 is a corrective release for the counterfactual proof planner. It keeps
planning deterministic and baseline-agnostic while preserving an explicit
`BASELINE_UNAVAILABLE` classification when the verifier has no exact pre-change
workspace to compare.

## Change

- `planProof()` selects counterfactual proof when usable tests are available;
  baseline capture is not a planner input.
- `verifyRepository()` emits `BASELINE_UNAVAILABLE` for that selected dimension
  when no exact baseline was captured.
- Planner tests cover source-only, existing-suite, source-plus-test, boundary,
  documentation-only, and empty changes.

## Validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 75/75 tests |
| `npm run build` | PASS |
| `git diff --exit-code -- dist` | PASS after the release build |
| `npm pack --dry-run --json` | PASS |
| CI Node 20/22 | required before merge |
| Remote Pi extension smoke | required after tag publication |

No npm publication is performed or claimed. Existing tags remain immutable. The current working tree contains unreleased development changes; they are not part of the v0.1.5 release evidence.
