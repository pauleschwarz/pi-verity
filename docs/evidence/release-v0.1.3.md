# Release evidence v0.1.3

**Date:** 2026-08-29

v0.1.3 is a packaging-only follow-up to v0.1.2. Runtime proof semantics and
ProofReceipt schema v3 are unchanged.

## Why this patch exists

The first real remote-tag smoke for v0.1.2 exposed an install regression:
Pi clones Git packages and runs `npm install --omit=dev`, while v0.1.2's
`prepare` script required the omitted TypeScript compiler. The install stopped
at `tsc: command not found` before Pi could load the extension.

v0.1.3 commits the generated `dist/` release files. Its prepare script rebuilds
when the pinned development compiler is installed; on Pi's production-only
install path it verifies the required prebuilt files and performs no download or
runtime compilation.

## Validation

| Check | Result |
| --- | --- |
| `npm ci` | PASS; prepare rebuilt from source, 0 vulnerabilities |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; 20 files checked |
| `npm run test` | PASS; 64/64 tests |
| `npm run build` | PASS |
| `npm pack --dry-run --json` | PASS; intentional allowlist |
| Clean production-only copy: `npm install --omit=dev` | PASS; used prebuilt release files |
| Production-only CLI doctor in a Git fixture | PASS; Pi Verity 0.1.3, Ready |
| Pi 0.84.3 load from the production-only copy | PASS; state-bound receipt emitted |
| Golden Demo | PASS: weak `UNPROVEN`, strong `PASS`, later `STALE` |

The immutable remote tag can only be tested after publication. That final check
must use Pi's actual `git:github.com/pauleschwarz/pi-verity@v0.1.3` path and is
recorded in the GitHub Release notes; it is not preclaimed here.

## Package boundary

The tarball adds only `scripts/prepare.mjs` relative to v0.1.2. `dist/` was
already part of the package allowlist and is now also committed so Git-source
installation does not depend on omitted development tools. No runtime
dependency, service, model, agent, or configuration surface was added.

No npm publication was performed or authorized. Existing release tags remain
unchanged.
