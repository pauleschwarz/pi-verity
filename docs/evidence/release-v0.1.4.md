# Release evidence v0.1.4

**Date:** 2026-08-30

v0.1.4 is the first proof-selection and ambient UX release on top of the
v0.1.3 Git-install path. ProofReceipt schema v3 is unchanged. No receipt field
or classification was added.

## Why this release exists

v0.1.3 fixed remote Git-tag installation. After that path worked, ambient
verification still over-claimed or over-ran in two practical cases:

1. documentation-only or no-change turns could still force standard verification
   and produce noisy `UNPROVEN` pressure;
2. counterfactual comparison could be selected without an exact pre-change
   workspace, which cannot produce honest baseline/candidate polarity.

v0.1.4 adds a deterministic local planner and tightens counterfactual selection
to require both usable tests and an exact baseline. Ambient PASS notices become
one fact line: files, `+added/-removed`, milliseconds. Failures stay actionable
and still point at `/verity why`.

## What changed in the product surface

| Surface | Change |
| --- | --- |
| Proof selection | `planProof()` classifies `none`, `docs_only`, `source`, `source+test`, `test`, `boundary` |
| Standard checks | skipped for docs-only / no-change |
| Counterfactual | selected only with usable tests **and** exact baseline |
| Missing baseline | explicit `BASELINE_UNAVAILABLE` evidence when candidate tests exist |
| Ambient PASS | `verity ✓ PASS · N files +A/-R · Xms` |
| Explicit `/verity run` | still announces every result |
| Schema | still ProofReceipt v3 |

## Validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test` | PASS; 76/76 tests |
| `npm run build` | PASS |
| `git diff --exit-code -- dist` | PASS |
| `npm run verify` | PASS after committed doctor VERSION bump in `dist/` |
| `npm pack --dry-run --json` | PASS; `pauleschwarz-pi-verity-0.1.4.tgz`, 64 files |
| Production-only install of packed tarball (`npm install --omit=dev`) | PASS; prepare used prebuilt `dist/` |
| Production-only CLI doctor against this repository | PASS; `Pi Verity 0.1.4` / Ready |
| Remote Pi install of `v0.1.4` | recorded after tag publication |

The immutable remote tag can only be tested after publication. That final check
must use Pi's actual `git:github.com/pauleschwarz/pi-verity@v0.1.4` path and is
recorded in the GitHub Release notes; it is not preclaimed here.

## Package boundary

No runtime dependency, service, model, agent, or configuration surface was
added. Release still ships prebuilt `dist/` plus `scripts/prepare.mjs` so Pi's
`npm install --omit=dev` path remains self-contained.

No npm publication was performed or authorized. Existing release tags
`v0.1.0` through `v0.1.3` remain immutable.
