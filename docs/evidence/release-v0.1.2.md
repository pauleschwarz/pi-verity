# Release evidence v0.1.2

**Date:** 2026-08-29

**Environment:** macOS 26.6.2, Node 22.23.2, npm 10.9.8, Git 2.55.0,
Pi 0.84.3

Validation used a detached worktree at the pre-release head with only the
v0.1.2 patch applied. This excluded unrelated local worktree changes.

## Automated gate

| Check | Result |
| --- | --- |
| `npm ci` | PASS; 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 20 files checked |
| `npm run test` | PASS; 64/64 tests |
| `npm run build` | PASS |
| `npm pack --dry-run --json` | PASS; allowlisted package contents only |

Counterfactual fixture results:

| Scenario | Expected | Actual |
| --- | --- | --- |
| Regression bugfix | baseline RED, candidate GREEN, `PROVEN_REGRESSION`, `PASS` | PASS |
| Non-discriminating test | baseline PASS, candidate PASS, `NON_DISCRIMINATING_TEST`, `UNPROVEN` | PASS |
| Candidate-only API | structural baseline failure, `TEST_NOT_PORTABLE`, no automatic `UNPROVEN` | PASS |
| Candidate broken | `CANDIDATE_FAILS`, `FAIL` | PASS |
| Exact baseline unavailable | `BASELINE_UNAVAILABLE`, `UNPROVEN` | PASS |

## Functional checks

| Check | Result |
| --- | --- |
| Golden Demo | PASS: weak `UNPROVEN`, strong `PASS`, later `STALE` |
| CLI doctor | PASS: reports Pi Verity 0.1.2 and Ready |
| Real Pi extension load | PASS with Pi 0.84.3 and the built adapter |
| `/verity doctor` | PASS: extension, Git, command, baseline, and repair status rendered |
| `/verity run` | PASS: produced a state-bound receipt in a deliberately dirty smoke workspace |
| `/verity` | PASS: current `PASS_WITH_WARNINGS` rendered for that dirty baseline |
| `/verity why` | PASS: check, counterfactual selection, scope, warnings, and verdict reasons rendered |
| README/local links | PASS |
| GitHub community-file locations | PASS: `.github/` is a supported discovery location |

The smoke workspace was deliberately dirty because it contained the staged
release patch. `PASS_WITH_WARNINGS` and the dirty-baseline warning were the
expected honest result, not a release-gate failure.

## Package and publication boundary

The package contains compiled runtime files, receipt schema, README, changelog,
license, the three user guides, examples README, and public evidence. Tests,
GitHub metadata, maintainer instructions, local harness data, proposals, and raw
artifacts are excluded.

No npm publication was performed or authorized. Existing `v0.1.0` and `v0.1.1`
tags remain unchanged.
