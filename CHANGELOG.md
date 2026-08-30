# Changelog

All notable changes are documented here. The project follows Semantic Versioning.

## [0.1.4] - 2026-08-30

### Added

- Deterministic proof planner: classifies patches as `none`, `docs_only`, `source`,
  `source+test`, `test`, or `boundary`, then selects only the proof dimensions that
  can actually speak for that change.
- Diff-first ambient receipt summaries: `verity ✓ PASS · N files +A/-R · Xms`.
- `captureGitDiffStat()` for tracked and untracked working-tree line counts.

### Changed

- Documentation-only and no-change turns no longer force standard verification or
  noisy `UNPROVEN` paths.
- Counterfactual selection now requires both usable tests and an exact pre-change
  workspace baseline; without that baseline Verity records `BASELINE_UNAVAILABLE`
  instead of pretending comparison is possible.
- Ambient PASS remains one quiet fact line after a real repository mutation;
  explicit `/verity run` still announces every result.

### Fixed

- False pressure to treat docs-only agent turns as incomplete verification.
- Counterfactual path no longer overclaims when the exact baseline was never captured.

### Notes

- ProofReceipt remains schema version 3; no receipt field or classification was added.
- Install from Git tag `v0.1.4`. npm publication remains unauthorized and unclaimed.
- v0.1.3 remains the last packaging-only install fix; v0.1.4 is the first proof-selection
  and ambient UX release on top of that install path.

## [0.1.3] - 2026-08-29

### Fixed

- Git-tag installation through Pi now works with Pi's default `npm install --omit=dev` path.
- Release tags include prebuilt `dist/` files; the prepare script rebuilds when TypeScript is installed and otherwise verifies the release build instead of requiring a runtime compiler.

### Notes

- v0.1.2 remains immutable but its Git-source install fails because its prepare script requires the omitted TypeScript dev dependency. Use v0.1.3.
- Runtime proof semantics and ProofReceipt schema v3 are unchanged from v0.1.2.
- npm publication remains unauthorized and unclaimed.

## [0.1.2] - 2026-08-29

### Changed

- Counterfactual proof is now optional when candidate evidence cannot execute meaningfully on the baseline.
- Structural missing-module, import, export, and symbol failures are classified as `TEST_NOT_PORTABLE` instead of regression proof.
- `TEST_NOT_PORTABLE` no longer makes an otherwise sufficiently verified patch `UNPROVEN`; `NON_DISCRIMINATING_TEST`, `BASELINE_UNAVAILABLE`, and `INCONCLUSIVE` remain unresolved evidence, while `CANDIDATE_FAILS` remains `FAIL`.
- Rewrote the README around the agent-self-certification problem and the ambient install/use path.
- Consolidated architecture, proof, counterfactual, adapter, configuration, design, and threat-model documentation into three user-facing guides.
- Moved GitHub community files under `.github/` and release instructions under `docs/maintainers/`; removed the speculative roadmap.

### Added

- Counterfactual fixtures for a candidate-only API, candidate failure, and unavailable exact baseline alongside the existing regression and non-discriminating fixtures.
- Concise release evidence and updated claim matrix for the applicability semantics.

### Notes

- ProofReceipt remains schema version 3; no receipt field or classification was added.
- Install from Git tag `v0.1.2`. npm publication remains unauthorized and unclaimed.
- Existing `v0.1.0` and `v0.1.1` tags are unchanged.

## [0.1.1] - 2026-08-28

### Changed

- Automatic repair is passive by default: `PI_VERITY_MAX_REPAIR_ATTEMPTS` defaults to `0` and invalid values fall back to `0`.
- `/verity doctor` reports whether automatic repair is disabled or enabled (limit N).
- README and onboarding docs lead with tag install, `/verity doctor`, the aha sequence, and evidence links; technical detail stays below the fold.
- Documented automatic repair as explicit opt-in only.

### Added

- `docs/GETTING_STARTED.md` five-step first-use path.
- `docs/evidence/README.md` public evidence index.
- `docs/evidence/provider-independence.md` with honest `BLOCKED` result when only one local provider route is configured.
- `scripts/evidence/benchmark.ts` plus recorded `docs/evidence/performance.md` / `performance.json` for no-change, small-patch, deterministic-proof, and counterfactual-proof timings (0 LLM calls on the deterministic path).
- Lifecycle coverage for the passive repair default.

### Notes

- Install from the protected Git tag `v0.1.1`. npm publication remains unauthorized/unclaimed.
- The `v0.1.0` tag is unchanged.

## [0.1.0] - 2026-08-28

### Changed

- Pi Verity is a model-agnostic execution gate that turns coding-agent patches into evidence-backed changes.
- Documented zero-config repository discovery; repository configuration is not supported in v0.1.
- Counterfactual evidence records platform-dependent network policy explicitly.
- Pinned GitHub Actions and development tooling for reproducible checks.

### Added

- Distributable Pi package manifest with a compiled extension and CLI.
- `/verity`, `/verity run`, `/verity why`, and `/verity receipt`.
- Quiet successful verification and bounded warning/failure summaries.
- Same-agent deterministic failure evidence with configurable repair limits.
- Stale-receipt detection for current-verdict commands.
- Re-entrancy protection for overlapping automatic and explicit verification.
- Exact repair baselines so automatic follow-ups retain counterfactual RED/GREEN protection.
- Scope Integrity signals with `FAIL`, `WARNING`, and `INFORMATION` severity.
- ProofReceipt schema version 3 and a distributable JSON Schema.
- GitHub issue templates, pinned CI, manual release-check workflow, release notes configuration, and Dependabot configuration.
- Separate unit and integration test scripts.

### Security

- Receipt files use mode `0600` where supported.
- Secret-like file contents are excluded from scope evidence.
- Failure evidence is bounded and redacts common secret assignment forms.
- Counterfactual execution denies network on supported macOS environments unless explicitly allowed.

### Known limitations

- npm distribution is configured as `@pauleschwarz/pi-verity`; publication remains manual and has not occurred.
- npm publication remains manual and no GitHub Release has been created.
- Cross-platform network isolation and complete detached process-tree cleanup are not guaranteed.
