# How Verity works

Verity is a deterministic execution gate. The agent may create the patch,
but the verifier derives its verdict from repository state and command results,
not from the agent's completion message or another model's opinion.

## Boundary

One package ships three small surfaces:

```text
src/core/        verifier; no Pi, model, or provider dependency
src/adapter-pi/  Pi lifecycle and slash commands
src/cli.ts       optional command-line entry point
```

There is no daemon, server, database, telemetry pipeline, reviewer model, or
secondary agent.

## Control plane and evidence plane

```text
CONTROL PLANE
agent tool request
→ deterministic execution policy
→ explicit user decision
→ allow or block

EVIDENCE PLANE
repository change
→ deterministic checks
→ scope and counterfactual evidence
→ proof verdict
```

These planes are independent. A blocked tool does not make a repository patch
`FAIL`, and a passing patch receipt does not retroactively authorize a tool.
The model may propose an action, but it does not decide whether a user denial
still applies. Approval is created only by Pi's explicit runtime confirmation.

## Lifecycle

```text
tool request           classify locally; confirm exact protected input or block
before agent turn      capture Git identity and exact workspace baseline
agent turn             observe permitted repository-capable tools
agent settled          compare state; skip if nothing changed
proof plan             classify the patch; select only meaningful checks
verification           run selected bounded checks in disposable copies
receipt                bind evidence to the final repository-state hash
later repository edit  report the prior receipt as STALE
```

Execution-policy decisions are separate `pi-verity-policy` session entries.
They contain request hashes and bounded summaries, not proof verdicts or model
reasoning. Local entries are audit evidence, not tamper-proof attestation.

The planner is deterministic and local. Documentation-only changes skip standard
verification. Counterfactual comparison is selected only when usable tests and an
exact pre-change workspace are both available. Ambient PASS notices stay one fact
line: changed files, `+added/-removed`, and elapsed milliseconds.

The original worktree is not reset, stashed, cleaned, or used as the command
workspace. Temporary copies are removed after verification. Receipts are stored
with mode `0600` where supported under:

```text
~/.pi/agent/pi-verity/receipts/<repository-hash>/
```

## Evidence dimensions

The receipt keeps explicit evidence rather than a score.

| Dimension | Receipt evidence | Required behavior |
| --- | --- | --- |
| Repository identity | baseline, changed files, final state hash | later changes make proof stale |
| Standard verification | selected command and bounded result | deterministic failure is `FAIL` |
| Scope integrity | factual signals with severity and evidence | blocking signals are `FAIL`; warnings stay explicit |
| Counterfactual | baseline/candidate results and classification | required only when meaningful and available |
| Runtime | only repository checks actually selected | never implied when not checked |

Zero-config discovery chooses at most one conservative repository command. This
is intentionally smaller than CI, not a replacement for it.

## Verdict rules

`PASS`
: Selected required checks completed successfully and no required dimension is
  unresolved.

`PASS_WITH_WARNINGS`
: Required checks passed, but explicit non-blocking facts remain, such as a
dirty baseline or public API change.

`FAIL`
: A repository command failed, the candidate failed its own evidence, or a
blocking scope-integrity signal fired.

`UNPROVEN`
: Required evidence is missing or inconclusive. Examples include no discovered
command for a changed repository, timeout, cancellation, unavailable expected
baseline, or a non-discriminating candidate test.

`STALE` is not a receipt verdict. It is the Pi adapter's report that the current
repository no longer matches a saved receipt.

## Counterfactual applicability

Counterfactual execution asks whether a candidate test actually depends on a
behavioral correction:

```text
baseline implementation + candidate test  -> RED
candidate implementation + candidate test -> GREEN
```

That question is powerful for a regression against an existing behavior. It is
not meaningful for every patch.

The deterministic decision is:

```text
candidate passes its selected evidence?
  no  -> CANDIDATE_FAILS
  yes -> can the candidate test execute meaningfully on baseline?
           no  -> TEST_NOT_PORTABLE
           yes -> baseline passes?
                    yes -> NON_DISCRIMINATING_TEST
                    no  -> PROVEN_REGRESSION
```

An exact baseline must also exist. If it was not captured,
`BASELINE_UNAVAILABLE` is explicit. Timeout, cancellation, or unavailable
network isolation produces `INCONCLUSIVE`.

### Regression fix

For an existing API and behavior:

```text
old code + candidate test      FAIL
patched code + candidate test  PASS
```

This is `PROVEN_REGRESSION`. It shows that the candidate test distinguishes the
patch from the baseline. It does not prove the requirement itself is correct or
complete.

### New functionality

For a new API such as `exportCsv()`, the baseline may have no module, export, or
symbol that the candidate test imports. Verity recognizes deterministic
missing-module/import/export/symbol diagnostics as structural baseline failures
and records `TEST_NOT_PORTABLE` instead of fake RED evidence.

`TEST_NOT_PORTABLE` is an explicit not-applicable state. It does not add an
unverified dimension by itself; standard verification and scope evidence decide
the patch verdict. The receipt still preserves the classification and command
results.

### Evidence that does not discriminate

If the candidate test passes against both old and new implementations, it is
`NON_DISCRIMINATING_TEST`. That remains `UNPROVEN`: the test exists, but does
not demonstrate that the patch caused the tested behavior.

### Candidate failure

If the candidate side fails, the classification is `CANDIDATE_FAILS` and the
verdict is `FAIL`, regardless of what happened on baseline.

## Test and scope integrity

Counterfactual proof is not allowed to hide obvious evidence weakening. The
verifier reports conservative, syntax-based facts including:

- test skipped or deleted
- assertion removed
- lint or type suppression added
- dependency, lockfile, build config, migration, generated file, or public API
  change
- secret-like or binary path added
- broad file spread

Rules state what they observed. A dependency warning does not claim the
dependency was unnecessary. Patch size alone cannot fail a patch.

## Bounded execution

Commands have time, output, and workspace-size bounds. Standard and
counterfactual commands run in disposable filesystem copies. Counterfactual
network denial is available on macOS; unsupported platforms report that the
isolation is unavailable. Repository commands still execute with the user's OS
privileges and may read files, environment variables, or the network.

## Model and provider independence

Model/provider identity is not a verdict input:

```text
any Pi model -> repository state -> same verifier rules
```

The shipped host adapter supports Pi. The exported core and CLI do not depend
on Pi APIs, but no other host adapter is shipped.

## Receipt schema

The current machine-readable receipt is schema version 5:

[`schemas/proof-receipt.v5.schema.json`](../schemas/proof-receipt.v5.schema.json)

Schema versions 3 and 4 remain available unchanged at
[`schemas/proof-receipt.v3.schema.json`](../schemas/proof-receipt.v3.schema.json)
and [`schemas/proof-receipt.v4.schema.json`](../schemas/proof-receipt.v4.schema.json).

A v5 receipt records repository identity, command results, counterfactual
evidence (with command narrowing safety), scope signals, mechanical
`test_delta`, bounded `effect_evidence`, optional `external_evidence`,
warnings, unresolved dimensions, and the verdict. Receipts are local, unsigned
evidence, not remote attestation.

### New in schema version 4

| Field | Meaning |
| --- | --- |
| `test_delta` | mechanical counts of added/modified/deleted test files, assertions, skips and suppressions; `weakened` is a fact, not a verdict |
| `effect_evidence.claims` | per-claim observation with `expected`, `observed`, and status `SOURCE_OBSERVED`, `RUNTIME_OBSERVED`, `UNCHECKED`, `SOURCE_CONTRADICTED`, or `RUNTIME_CONTRADICTED` |
| `narrowing` on commands and counterfactual evidence | `safe` when the discovered command could be reduced to the candidate test verifiably, `unverified` otherwise |
| `SCOPE_TEST_RENAMED` | a test title rename or split, reported instead of a terminal deletion signal |

See [Limitations](LIMITATIONS.md) for what these checks cannot establish.
