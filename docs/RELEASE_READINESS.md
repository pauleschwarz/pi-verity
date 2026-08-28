# Release Readiness Report

**Assessment date:** 2026-08-27

**Candidate:** `0.1.0`

**Local environment:** macOS, Node `22.23.2`, npm `10.9.8`, Pi `0.84.3`

**Publication action taken:** none

## Verdict

```text
LOCAL RELEASE GATES PASS — REMOTE RELEASE GATES PENDING
```

The implementation is a high-quality local/Git **pre-release candidate** and passes the local technical gates below. The owner selected these release identities:

- GitHub: `pauleschwarz/pi-proof`
- npm: `@pauleschwarz/pi-proof`

The scoped npm name returned `E404` on 2026-08-28 and is therefore not currently published. The unscoped `pi-proof` name remains a different package maintained by `kreek`; this does not prevent the GitHub repository name or scoped npm name selected above.

Public release is still gated on pushing the release candidate, observing GitHub CI, confirming npm scope authorization, and installing from an immutable tag. The local repository is initialized on `main`; its initial release-candidate commit uses the owner-provided GitHub noreply identity for `pauleschwarz`. An empty private repository now exists at `pauleschwarz/pi-proof` and is configured locally as `origin`, but no commit has been pushed. `npm whoami` currently returns `ENEEDAUTH`, so registry authorization is not available in this environment. No package, commit, tag, or release was published.

## Quality gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint`; Biome checked 18 TypeScript files with no findings |
| Unit tests | PASS | `npm run test:unit`: 26/26 |
| Integration tests | PASS | `npm run test:integration`: 25/25 |
| Full suite | PASS | `npm test`: 51/51 |
| Build | PASS | `npm run build` |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Package inspection | PASS | `npm pack --dry-run --json`; allowlisted content only |
| Fresh tarball install | PASS | Installed generated `0.1.0` tarball into an empty npm project; compiled adapter and schema present |
| Git-source install | PASS | Installed from a fresh local `git+file:` repository; `prepare` built adapter and CLI |
| Pi package smoke | PASS | Pi `0.84.3` loaded the local package and executed `/proof run`; one structured session entry and receipt were produced |
| Receipt schema | PASS | Draft 2020-12 schema checked and validated against a fresh CLI receipt with Python `jsonschema 4.26.0` |
| Model independence fixture | PASS | Identical fixture executed through Pi routes `omniroute/economy` and `omniroute/free`; normalized proof semantics were identical |
| App proof gate | PASS / not required | `appproof gate`: backend classification, exit 0; real Pi command and model smoke tests covered adapter behavior functionally |

## Model-independence result

Both routes were given the same task in separate, identical Git fixtures. Each created exactly `result.txt` containing `ok\n`. Both receipts had:

```text
schema_version: 3
changed_files: [result.txt]
selected command: npm run test
command exit: 0
scope baseline: exact_workspace
scope signals: []
counterfactual: null
warnings: []
unverified dimensions: []
verdict: PASS
```

The semantic projections were byte-for-byte equal after excluding expected identity/timing fields such as repository root, task/session IDs, timestamps, durations, and hashes. The test establishes independence across two materially different Pi model routes. Both routes use the local `omniroute` provider interface; this run does not prove that OmniRoute selected two distinct upstream vendors.

## Pi adapter behavior

Implemented and exercised:

- `/proof` — current concise verdict; detects stale repository state.
- `/proof run` — explicit verification; overlapping runs are coalesced.
- `/proof why` — selected command, counterfactual selection/classification, scope baseline, every signal, bounded evidence, warnings, and unverified dimensions.
- `/proof receipt` — persisted path plus canonical structured receipt.
- Quiet automatic `PASS`; bounded notifications for warning/failure.
- Minimum bounded deterministic failure evidence sent to the same session agent.
- Default two automatic repair follow-ups, configurable `0..10`.
- Limit exhaustion queues evidence without triggering another turn.
- Automatic repair retains an exact failed-state workspace for counterfactual RED/GREEN verification.

Lifecycle integration fixtures specifically cover exact repair baselines, repair-limit stopping, and concurrent `/proof run` coalescing.

## Package inspection

The npm `files` allowlist contains only:

- compiled `dist/` JavaScript, declarations, and source maps
- public README/changelog/license/security/community documentation
- implementation-accurate public docs
- ProofReceipt v3 JSON Schema
- packaged examples README
- package manifest

Excluded from the tarball:

- `node_modules/`
- tests and fixtures
- `.github/`
- internal `raw/`, `proposal/`, and `evidence/`
- the supplied `pi-proof-github-docs.zip`
- local build/research artifacts not in the allowlist

The only runtime dependency is `smol-toml@1.8.0` (BSD-3-Clause). Development-only tooling is TypeScript, `tsx`, Node types, and Biome.

## Security and side-effect review

Source inspection found:

- no `fetch`, HTTP client, WebSocket, analytics, telemetry, or provider/LLM call in `src/`
- no automatic dependency installation
- no secondary-agent creation
- no shell execution for discovered verification commands
- bounded command duration, output, workspace size, and scope evidence
- path traversal and symlink fixture coverage
- secret-like path detection without file-content disclosure

Documented writes are:

1. OS temporary directories for exact baselines and isolated command execution; cleanup is registered.
2. `~/.pi/agent/pi-proof/receipts/<repository-hash>/` from the Pi adapter, mode `0600` where supported.
3. The explicit CLI `--output` path, mode `0600` where supported.
4. Files created by trusted repository commands inside disposable workspace copies.

Repository-defined commands still execute with user privileges and may read the environment or use the network. Counterfactual network denial is macOS-specific unless explicitly allowed. Command output can contain repository-produced secrets and receipts must be treated as sensitive.

## GitHub publication setup

Prepared without external action:

- pinned Node 20/22 CI workflow
- manual release-check workflow that verifies, packs, and uploads an artifact but does not publish
- issue and pull-request templates
- release-note categories
- Dependabot configuration
- security, support, contribution, code-of-conduct, changelog, roadmap, and release guides
- exact Git and npm publication steps in [`RELEASING.md`](../RELEASING.md)

## Remaining validation and decisions

Completed identity decisions:

- [x] GitHub owner/repository: `pauleschwarz/pi-proof`
- [x] npm package: `@pauleschwarz/pi-proof`
- [x] package metadata, public `publishConfig`, lockfile, and installation docs updated
- [x] registry check confirmed the scoped package is not currently published

Required before public release:

- [ ] authenticate npm (`npm whoami` currently returns `ENEEDAUTH`) and confirm publish access to the `@pauleschwarz` scope
- [x] initialize local Git on `main`, exclude internal research/archive material, and review the intended public file set
- [x] configure the owner-provided GitHub noreply commit identity and create the initial local commit
- [x] create the empty private GitHub repository and configure it as `origin`
- [ ] push the release candidate explicitly
- [ ] enable private vulnerability reporting
- [ ] observe CI passing on Node 20 and 22 in GitHub
- [ ] install from the actual immutable GitHub tag
- [ ] inspect the final tagged tarball and publish manually with provenance

Recommended, not blocking the current local pre-release candidate:

- test an additional direct non-OmniRoute provider when credentials and cost approval are available
- add automated schema validation to CI rather than relying on the recorded release-gate command
- refactor the large Scope Integrity coordinator functions only when doing so can preserve the existing fixture-proven semantics

## Release decision

The code and package layout pass the local release gates and are ready for the `pauleschwarz/pi-proof` GitHub pre-release process. A public npm or GitHub release must not be claimed until the unchecked authorization/remote gates above are completed.
