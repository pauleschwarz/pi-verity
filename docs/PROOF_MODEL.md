# Proof Model

A `ProofReceipt` records deterministic evidence observed for one repository state. It is not a guarantee of total correctness.

## Verdicts

### `PASS`

All selected checks completed successfully, no blocking scope signal fired, and no required dimension remained unresolved.

### `PASS_WITH_WARNINGS`

Selected checks passed, but non-blocking evidence remains, such as a dependency addition, broad file spread, dirty baseline, or unavailable optional counterfactual proof.

### `FAIL`

A selected command failed deterministically, the candidate side of counterfactual verification failed, or a scope-integrity signal with severity `FAIL` fired.

### `UNPROVEN`

The verifier could not establish required evidence: no command was discovered for a changed repository, a command timed out or was cancelled, the baseline was unavailable where required, or another dimension remained unresolved.

`INCONCLUSIVE` counterfactual evidence never becomes `PASS`.

## Receipt schema

The current schema version is `3`. The machine-readable schema ships at [`schemas/proof-receipt.v3.schema.json`](../schemas/proof-receipt.v3.schema.json).

Top-level fields are:

```text
schema_version
task_id
session_id
repository_root
created_at
baseline
final_diff_hash
changed_files
repository_changed_since_baseline
verification_commands
counterfactual
scope_integrity
warnings
unverified_dimensions
verdict
```

Canonical JSON uses recursively sorted object keys. Receipt arrays preserve meaningful deterministic order.

## Evidence dimensions

### Repository identity

The baseline and final state are identified from Git commit/status/content state. The final state hash is stored as `final_diff_hash`. Pi commands detect a later mismatch and mark the previous receipt stale.

### Standard verification

Each selected result records source, kind, argv, isolated working directory, exit code, duration, bounded stdout/stderr, truncation, timeout, and cancellation.

### Counterfactual verification

When applicable, the receipt records:

- changed candidate test files
- command
- baseline and candidate command results
- classification
- anti-gaming signals
- network-policy status
- disposable workspace size
- deterministic diagnosis

Classifications are:

```text
PROVEN_REGRESSION
NON_DISCRIMINATING_TEST
BASELINE_UNAVAILABLE
TEST_NOT_PORTABLE
CANDIDATE_FAILS
INCONCLUSIVE
```

### Scope integrity

Every scope signal includes:

- severity: `FAIL`, `WARNING`, or `INFORMATION`
- stable signal code
- affected file
- observed fact
- explanation of why the signal fired
- bounded evidence lines

Patch size alone cannot produce `FAIL`. Signals do not assert that a change was unnecessary.

## Binding and trust

The receipt is bound to a repository state, not to a model identity. For the same repository state, toolchain, platform, and configuration, model/provider choice does not alter verdict rules.

A receipt is local evidence, not remote attestation. It is not signed and can be edited by a user with filesystem access. Consumers that need stronger provenance must add signing or CI artifact controls outside this package.

## Sensitive data

Secret-like file contents are not emitted by scope analysis. Repository commands control their own output, which may contain sensitive data; stdout/stderr in receipts must therefore be treated as sensitive. Pi receipt files use mode `0600` where supported.
