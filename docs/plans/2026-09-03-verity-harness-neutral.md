# Verity: harness-neutral migration and product simplification

Status: active
Owner decision: the visible product is **Verity**. Pi becomes one optional adapter. visual-qa becomes the browser-evidence integration. Existing machine contracts remain compatible.

## Product boundary

```text
Verity core        repository checks, counterfactuals, receipts, verdicts
Host adapters      Pi first; other harnesses call the CLI or core API
Evidence adapters  visual-qa first; explicit opt-in, fail-closed
```

The core does not import a harness SDK or a browser runtime. Existing `pi-verity` commands, package identity, receipt URNs, schemas and persisted `pi-verity*` IDs remain available as legacy contracts during the migration.

## Slice 0 — simplify visual-qa first

Acceptance:

- [x] `visual-qa --help` exits 0 and invalid usage exits 2 with actionable text.
- [x] Reports are portable (`report.json`, `report.md`, self-contained `report.html`).
- [x] Package tarball excludes internal plans and runtime dependencies exclude dev-only Verity.
- [x] `npm run verify` passes.
- [x] Focused PR merged before Verity integration.

Checks:

```sh
cd ../visual-qa
npm run verify
npm pack --dry-run --json
git diff --check
```

## Slice 1 — visible Verity, compatibility preserved

Acceptance:

- [x] `verity` is the canonical binary; `pi-verity` remains an alias.
- [x] `@pauleschwarz/pi-verity/adapters/pi` is canonical; `./adapter-pi` remains valid.
- [x] Current user-facing text says Verity; legacy IDs/package/URLs remain unchanged.
- [x] CLI doctor is host-neutral; `/verity doctor` reports the Pi adapter separately.
- [x] v3/v4 schemas and receipt semantics are unchanged.

Checks:

```sh
npm run verify
npm pack --dry-run --json
node dist/cli.js --help
node dist/cli.js doctor .
git diff --exit-code -- schemas src/core/types.ts src/core/receipt.ts src/core/verifier.ts
```

## Slice 2 — harness-neutral integration surface

Acceptance:

- [ ] Any harness can invoke `verity verify` and consume stable JSON + exit codes.
- [ ] Root/core exports do not require Pi.
- [ ] Adapter import paths are documented and tested.
- [ ] One copy-paste generic harness loop is documented.

Checks:

```sh
npm run verify
node --input-type=module -e 'import("./dist/core/index.js").then(m => { if (!m.verifyRepository) process.exit(1) })'
```

## Slice 3 — visual-qa integration

Safety rule: browser PASS cannot create proof unless the browser subject is bound to the candidate. In the initial integration, visual-qa is an explicit, conservative external check: FAIL blocks, incomplete/blocked is UNPROVEN, PASS is recorded with an explicit subject-binding warning unless Verity managed the app process.

Acceptance:

- [ ] visual-qa remains standalone and optional.
- [ ] Verity core has no Playwright dependency.
- [ ] Missing binary, malformed report, timeout and incomplete coverage fail closed.
- [ ] Browser artifacts stay separate; Verity stores only bounded summary + hashes.
- [ ] Repository mutation during provider execution invalidates PASS.
- [ ] Receipt schema migration is versioned; v3/v4 remain readable/frozen.

Checks:

```sh
npm run verify
node --import tsx --test test/evidence-provider.test.ts test/schema.test.ts
```

## Slice 4 — distribution (Phase 3)

Acceptance:

- [ ] Public README leads with one promise, doctor, demo, real-project path.
- [ ] `@pauleschwarz/verity` packaging/publish decision is implemented without breaking Git installs.
- [ ] GitHub repository/product name is migrated only after compatibility release.
- [ ] CI example and 60-second demo exist.
- [ ] Release is tagged only after protected-branch CI is green.

Checks:

```sh
npm run verify
npm pack --dry-run --json
gh pr checks <PR>
```

## Deferred deliberately

- No universal execution-approval claim: only adapters with a proven pre-tool hook may enforce it.
- No automatic execution of repository-provided external-provider config.
- No browser PASS against an arbitrary external URL treated as candidate proof.
- No removal of legacy names before a later major release.
