# Release Readiness Report

**Assessment date:** 2026-08-28

**Release:** `0.1.0`

**Local environment:** macOS, Node `22.23.2`, npm `10.9.8`, Pi `0.84.3`

**Publication action taken:** repository made public; immutable `v0.1.0` tag pushed; GitHub Release published; no npm publication

## Verdict

```text
LOCAL AND TAG GATES PASS — GITHUB RELEASE PUBLISHED; NPM PUBLICATION PENDING
```

The implementation is a high-quality local/Git v0.1 release and passes the local technical gates below. The selected release identities are:

- GitHub: `pauleschwarz/pi-verity`
- npm: `@pauleschwarz/pi-verity`

The scoped npm name returned `E404` on 2026-08-28 and is therefore not currently published.

The canonical repository is public at `pauleschwarz/pi-verity`. History was squashed to one clean release commit, and `main` plus immutable tag `v0.1.0` are pushed. Repository description and topics are set, GitHub CI and the manual release check passed on the cleaned head, and a fresh anonymous tag checkout passed verify and package dry-run. Vulnerability alerts are enabled. GitHub Release `v0.1.0` is published at https://github.com/pauleschwarz/pi-verity/releases/tag/v0.1.0; no npm package was published.

The remaining optional publication action is separately authorized npm publication.

## Quality gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint`; Biome `2.5.10` checked 18 TypeScript files with no findings |
| Unit tests | PASS | `npm run test:unit`: 26/26 |
| Integration tests | PASS | `npm run test:integration`: 25/25 |
| Full suite | PASS | `npm test`: 60/60 |
| Build | PASS | `npm run build` |
| Runtime dependency audit | PASS | `npm audit --omit=dev`: 0 vulnerabilities |
| Package inspection | PASS | `npm pack --dry-run --json`: 64 allowlisted files; extracted tarball contains no legacy public-name references |
| Fresh tarball install | PASS | Installed generated `0.1.0` tarball into an empty npm project; core and Pi-adapter exports loaded |
| Git-source install | PASS | Installed from a fresh local `git+file:` repository; `prepare` built adapter and CLI |
| CLI / README smoke | PASS | Built a clean fixture, ran the README command, and received a schema-v3 `PASS` receipt from `pi-verity verify` |
| Pi extension load | PASS | Pi `0.84.3` loaded the compiled extension with only the explicit extension enabled; lifecycle command behavior remains integration-tested |
| Configuration | PASS / not shipped | Repository configuration is not supported in `0.1.0`; discovery is zero-config and no parser is shipped |
| Receipt schema | PASS | Draft 2020-12 schema validated against a fresh installed-CLI receipt with Python `jsonschema 4.26.0` |
| GitHub metadata syntax | PASS | All workflow, issue-template, Dependabot, and release YAML parsed successfully |
| Model independence fixture | NOT APPLICABLE | v0.1 proof semantics do not depend on model/provider; Pi is the supported host adapter |
| App proof gate | PASS | `appproof gate` exited `0`; the classifier's JSX-like web heuristic was covered with fresh real-Pi functional evidence and an 80-column TUI layout check |
| GitHub CI | PASS | CI `33200592745` and manual release-check `33200650128` passed for cleaned root commit `f394848` |
| Counterfactual portability | PASS | Counterfactual fixtures request network explicitly; platform policy is recorded in the receipt and no global network-isolation claim is made |

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

Model/provider identity is not an input to the deterministic proof engine. v0.1 does not claim independent upstream-provider testing.

## Pi adapter behavior

Implemented and exercised:

- `/verity` — current concise verdict; detects stale repository state.
- `/verity run` — explicit verification; overlapping runs are coalesced.
- `/verity why` — selected command, counterfactual selection/classification, scope baseline, every signal, bounded evidence, warnings, and unverified dimensions.
- `/verity receipt` — persisted path plus canonical structured receipt.
- Quiet automatic `PASS`; bounded notifications for warning/failure.
- Minimum bounded deterministic failure evidence sent to the same session agent.
- Default two automatic repair follow-ups, configurable `0..10`.
- Limit exhaustion queues evidence without triggering another turn.
- Automatic repair retains an exact failed-state workspace for counterfactual RED/GREEN verification.

Lifecycle integration fixtures specifically cover exact repair baselines, repair-limit stopping, and concurrent `/verity run` coalescing.

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
- the supplied `pi-verity-github-docs.zip`
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
2. `~/.pi/agent/pi-verity/receipts/<repository-hash>/` from the Pi adapter, mode `0600` where supported.
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

- [x] GitHub owner/repository: `pauleschwarz/pi-verity`
- [x] npm package: `@pauleschwarz/pi-verity`
- [x] package metadata, public `publishConfig`, lockfile, and installation docs updated
- [x] registry check confirmed the scoped package is not currently published

Release actions and non-blocking follow-ups:

- [x] GitHub Release `v0.1.0` published at https://github.com/pauleschwarz/pi-verity/releases/tag/v0.1.0
- [ ] npm publication: requires npm authentication and separate explicit authorization

- [ ] authenticate npm (`npm whoami` currently returns `ENEEDAUTH`) and confirm publish access to the `@pauleschwarz` scope
- [x] initialize local Git on `main`, exclude internal research/archive material, and review the intended public file set
- [x] configure the owner-provided GitHub noreply commit identity and create the initial local commit
- [x] rename the empty placeholder to `pauleschwarz/pi-verity` and configure it as `origin`
- [x] set the GitHub description and accurate repository topics from [`RELEASING.md`](../RELEASING.md)
- [x] push the release commit explicitly
- [x] observe CI passing on Node 20 and 22 in GitHub
- [x] enable GitHub vulnerability alerts
- [x] decide repository visibility and change the repository to public after the final public-state gate
- [x] triage the open Dependabot pull requests; equivalent updates were applied on `main`, while TypeScript `7.0.2` was rejected as incompatible
- [x] tag the release and install from the actual immutable GitHub tag `v0.1.0`
- [x] inspect the tagged tarball; package identity and legacy-name scan passed
- [ ] authenticate npm and publish manually with provenance (only if explicitly approved)

Recommended, not blocking the current v0.1 release:

- test additional host/provider integrations only when they become supported scope
- add automated schema validation to CI rather than relying on the recorded release-gate command
- refactor the large Scope Integrity coordinator functions only when doing so can preserve the existing fixture-proven semantics

## Release decision

The code and package layout pass the local gates and GitHub gates, including CI on Node 20 and 22. The repository is public, vulnerability alerts are enabled, GitHub Release `v0.1.0` is published, and npm publication remains intentionally pending authentication and explicit authorization.
