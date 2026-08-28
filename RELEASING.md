# Releasing

Nothing in this repository publishes automatically. The release workflow only verifies and uploads a package tarball artifact; a maintainer must explicitly make `pauleschwarz/pi-verity` public, create the GitHub release, and publish `@pauleschwarz/pi-verity` to npm.

The repository remains private until the final public-state gate passes. npm publication remains a separate, explicit step.

## One-time setup

The repository and package identities are configured in `package.json`. Before the first public release:

1. Confirm `npm whoami` is an account allowed to publish under the `@pauleschwarz` scope.
2. Confirm `npm view @pauleschwarz/pi-verity` still returns `E404`; this means no package currently exists at that name, not that publication permission is established.
3. Enable GitHub private vulnerability reporting in repository settings. The REST endpoint returns `404` while the repository is private, so use the web UI or enable it after the visibility change.
4. Confirm the GitHub description is: `Model-agnostic execution gate for coding agents. Turns agent patches into evidence-backed changes.`
5. Confirm the topics: `ai-agents`, `coding-agents`, `verification`, `developer-tools`, `typescript`, `pi`, `agentic-engineering`, `software-testing`.
6. Verify the repository's absolute advisory URL in the issue-template contact link.
7. Triage open Dependabot pull requests; major GitHub Action bumps must pass CI before merging.

## Local release gate

```bash
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm audit
npm pack --dry-run
```

Also complete and record:

- fresh tarball installation
- Git-source installation
- real Pi package smoke test
- same fixture through at least two materially different Pi model/provider routes
- ProofReceipt JSON Schema validation
- runtime dependency/license review
- source scan for product network, telemetry, and undocumented writes

Update [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md) with exact commands and unresolved limitations.

## Prepare the GitHub repository

Preserve the existing local Git history. Review the complete diff and tracked file set before any remote action; internal `raw/`, `proposal/`, `evidence/`, and source archives are intentionally excluded from the public repository and npm tarball.

`pauleschwarz/pi-verity` is private during preparation; `main` is pushed, and CI passes on Node 20 and 22:

```bash
git remote -v
git status --short
git push origin main
```

Before each release, review the tracked file list, Git history, security policy, description, and topics. Tagging and publishing remain explicit external actions.

## Git release

1. Confirm CI passes on Node 20 and 22.
2. Run the manual **Release check** workflow and inspect its tarball artifact.
3. Update version and changelog.
4. Commit the release changes.
5. Create an annotated tag:

```bash
git tag -a v0.1.0 -m "pi-verity v0.1.0"
git push origin v0.1.0
```

1. Create the GitHub release from the generated notes and attach the inspected tarball if useful.
2. Verify installation from the protected release tag:

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.0
```

## npm release

From a clean checkout at the release tag:

```bash
npm ci
npm run verify
npm pack --dry-run
npm publish
```

`prepublishOnly` reruns verification. `publishConfig` requests public access and npm provenance. Publishing remains a manual command; inspect the final confirmation and resulting registry page.

## Release integrity

Published versions are append-only. Never move an existing version tag; publish a new patch release.

Enforced state on `pauleschwarz/pi-verity`:

- `v*` tags identify the exact commit that passed the release gate for that version.
- The repository ruleset `release-tag-protection` blocks update, non-fast-forward, and deletion of `refs/tags/v*`.
- The repository ruleset `main-protection` blocks force-push and deletion of `main` and requires the CI checks `verify (20)` and `verify (22)`.
- A published tag is never repointed. Any fix ships as a new patch version with its own tag.

What this is not: repository rules prevent mutation of refs, they do not provide cryptographic authenticity. Tags in this repository are currently unsigned, there is no artifact attestation, and the GitHub Release API still reports `immutable: false` for existing releases. Do not describe releases as cryptographically attested or as GitHub-native immutable releases.

## Release notes

Every release should state:

- proof semantics changes
- checks/signals added or removed
- receipt schema changes
- Pi compatibility tested
- model/provider routes tested
- security changes
- known limitations
