# Changelog

All notable changes are documented here. The project follows Semantic Versioning.

## [Unreleased]

### Changed

- Renamed the unreleased project, package, CLI, Pi commands, environment variables, receipt storage, metadata, and documentation to Pi Verity / `pi-verity`.
- Positioned Pi Verity as a model-agnostic execution gate that turns coding-agent patches into evidence-backed changes.
- Reserved `.pi-verity.yml` as the sole future repository-configuration filename; no parser or legacy alias is shipped.
- Counterfactual test fixtures request network explicitly, so RED/GREEN classification no longer depends on the macOS-only sandbox runner and passes CI on Linux.
- Updated pinned GitHub Actions to `checkout@v7.0.1`, `setup-node@v7.0.0`, and `upload-artifact@v7.0.1`, and development tooling to Biome `2.5.10`, `@types/node` `26`, and TypeScript `5.9`. TypeScript `7.0.2` was evaluated and rejected: it fails to resolve Node built-in modules under `NodeNext` in this project.

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
- The GitHub repository is private during ongoing iteration; no tag or release exists.
- Cross-platform network isolation and complete detached process-tree cleanup are not guaranteed.
