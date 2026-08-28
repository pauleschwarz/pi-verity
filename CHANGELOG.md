# Changelog

All notable changes are documented here. The project follows Semantic Versioning.

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
