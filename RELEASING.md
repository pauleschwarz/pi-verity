# Releasing

Nothing in this repository publishes automatically. The release workflow only verifies and uploads a package tarball artifact; a maintainer must explicitly create `pauleschwarz/pi-proof`, create the GitHub release, and publish `@pauleschwarz/pi-proof` to npm.

## One-time setup

The repository and package identities are configured in `package.json`. Before the first public release:

1. Confirm `npm whoami` is an account allowed to publish under the `@pauleschwarz` scope.
2. Confirm `npm view @pauleschwarz/pi-proof` still returns `E404`; this means no package currently exists at that name, not that publication permission is established.
3. Create `pauleschwarz/pi-proof` and enable GitHub private vulnerability reporting.
4. Add the repository's absolute advisory URL to the issue-template contact links if desired.

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

## Create the GitHub repository

This directory was delivered without Git history. Review all files before the first commit, especially `raw/`, `proposal/`, `evidence/`, and the source documentation ZIP; those are not included in the npm tarball and may be omitted from the public repository if they are not intended for publication.

A typical explicit flow is:

```bash
git init -b main
git add .
git status --short
git commit -m "feat: initial pi-proof pre-release"
gh repo create pauleschwarz/pi-proof --source=. --private --remote=origin
git push -u origin main
```

Use `--public` only after reviewing the staged file list and security policy. Creating a repository or pushing is an external action and is intentionally not automated here.

## Git pre-release

1. Confirm CI passes on Node 20 and 22.
2. Run the manual **Release check** workflow and inspect its tarball artifact.
3. Update version and changelog.
4. Commit the release changes.
5. Create an annotated tag:

```bash
git tag -a v0.1.0 -m "pi-proof v0.1.0"
git push origin v0.1.0
```

1. Create a GitHub pre-release from the generated notes and attach the inspected tarball if useful.
2. Verify installation from the immutable tag:

```bash
pi install git:github.com/pauleschwarz/pi-proof@v0.1.0
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
