# Releasing

Nothing in this repository publishes automatically. The release workflow only verifies and uploads a package tarball artifact; a maintainer must explicitly create `pauleschwarz/pi-verity`, create the GitHub release, and publish `@pauleschwarz/pi-verity` to npm.

## One-time setup

The repository and package identities are configured in `package.json`. Before the first public release:

1. Confirm `npm whoami` is an account allowed to publish under the `@pauleschwarz` scope.
2. Confirm `npm view @pauleschwarz/pi-verity` still returns `E404`; this means no package currently exists at that name, not that publication permission is established.
3. Create `pauleschwarz/pi-verity`, or safely rename the empty private placeholder if it still exists, and enable GitHub private vulnerability reporting.
4. Set the GitHub description to: `Model-agnostic execution gate for coding agents. Turns agent patches into evidence-backed changes.`
5. Add only accurate topics from: `ai-agents`, `coding-agents`, `verification`, `developer-tools`, `typescript`, `pi`, `agentic-engineering`, `software-testing`.
6. Verify the repository's absolute advisory URL in the issue-template contact link.

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

If the earlier empty private placeholder still exists, rename it safely to `pauleschwarz/pi-verity`; otherwise create only the canonical repository. Then set the local remote and push explicitly:

```bash
git remote set-url origin https://github.com/pauleschwarz/pi-verity.git
git status --short
git push -u origin main
```

Use public visibility only after reviewing the tracked file list, security policy, description, and topics. Creating, renaming, changing visibility, or pushing a repository is an external action and must remain explicit.

## Git pre-release

1. Confirm CI passes on Node 20 and 22.
2. Run the manual **Release check** workflow and inspect its tarball artifact.
3. Update version and changelog.
4. Commit the release changes.
5. Create an annotated tag:

```bash
git tag -a v0.1.0 -m "pi-verity v0.1.0"
git push origin v0.1.0
```

1. Create a GitHub pre-release from the generated notes and attach the inspected tarball if useful.
2. Verify installation from the immutable tag:

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

## Release notes

Every release should state:

- proof semantics changes
- checks/signals added or removed
- receipt schema changes
- Pi compatibility tested
- model/provider routes tested
- security changes
- known limitations
