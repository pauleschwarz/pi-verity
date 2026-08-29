# Releasing

GitHub releases are explicit. npm publication is a separate action and is not
authorized by the repository workflow.

## Local gate

From a clean checkout:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm pack --dry-run
```

Also run the Golden Demo, a real Pi extension load, `/verity doctor`, `/verity`,
and `/verity why`. Check README links, the package allowlist, receipt schema, and
the moved GitHub community files.

Record the exact result under [`docs/evidence/`](../evidence/README.md).

## GitHub release

1. Update `package.json`, `package-lock.json`, `CHANGELOG.md`, install examples,
   and release evidence to the same version.
2. Commit only after the local gate passes.
3. Push `main` and wait for required Node 20/22 CI checks.
4. Create a new annotated `vX.Y.Z` tag. Never move an existing tag.
5. Push the tag and create a GitHub release from it.
6. Verify installation from the tag:

```bash
pi install git:github.com/pauleschwarz/pi-verity@vX.Y.Z
```

The release workflow verifies and uploads an artifact; it does not publish to
npm.

## npm

Do not run `npm publish` without separate authorization. If publication is ever
authorized, use a clean tag checkout and rerun the full local gate before the
manual command.

## Integrity

- `v*` tags are append-only release identities.
- `main` and release tags must not be force-pushed.
- Tags are currently unsigned; repository rules are not cryptographic
  attestation.
- Release notes must state proof-semantics changes, schema changes, Pi version
  tested, security changes, and factual limitations.
