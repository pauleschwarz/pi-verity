# Release evidence v0.2.0

**Date:** 2026-08-31

Local validation for the v0.2.0 release (schema v4, execution policy, persistent
keyed Pi status, silent ambient PASS).

## Change

- `SCHEMA_VERSION` is 4; receipts use `schemas/proof-receipt.v4.schema.json`.
- Historical v3 schema remains unchanged for v0.1.5 and earlier receipts.
- v4 adds bounded `effect_evidence`, mechanical `test_delta`, conservative
  command/counterfactual `narrowing`, and `SCOPE_TEST_RENAMED`.
- Optional `PI_VERITY_EXECUTION_POLICY=mutating|all` with fail-closed approval.
- Persistent `ctx.ui.setStatus("pi-verity", ...)` status line; ambient PASS is
  status-only (no notify/message/transcript).
- Package version is `0.2.0` in `package.json` and `package-lock.json`.

## Validation

| Check | Result |
| --- | --- |
| `npm ci` | PASS (clean install before release gate) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS; 117/117 tests |
| `npm run build` | PASS |
| `git diff --exit-code -- dist` | PASS after release build |
| `npm pack --dry-run` | PASS; v3 and v4 schemas included |
| AppProof gate | PASS (status journeys + policy deny/allow) |
| v3 schema vs `git show HEAD:schemas/proof-receipt.v3.schema.json` | PASS (unchanged historical fact) |

## Release actions

Recorded after local gate:

1. Commit on `main` for v0.2.0
2. Push `main` and wait for required CI
3. Annotated tag `v0.2.0` (append-only)
4. GitHub release from the tag
5. Remote Pi install smoke: `pi -e git:github.com/pauleschwarz/pi-verity@v0.2.0`
6. npm publish only with separate auth on a clean tag checkout

## Limitations (factual)

- Policy enforcement is limited to Pi `tool_call` hooks; bypasses outside that
  boundary remain out of scope.
- Status is informational; approval remains Pi `ui.confirm`.
- Counterfactual narrowing may be unverified when package scripts embed their
  own globs; receipts surface that as weaker evidence, not false PROVEN_REGRESSION
  certainty.
