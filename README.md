# Pi Verity

**Pi Verity turns agent patches into evidence-backed changes.**

A model-agnostic **execution gate** that independently proves:

- what an agent changed,
- whether the evidence actually depends on that change,
- and whether that proof is still valid.

The model may produce the change. It does not certify the change.

Pi Verity is **not** another reviewer, planner, router, or second agent. It is a
deterministic gate over repository state and repository-defined checks.

## 60-second start

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.0
```

Then, inside a Git repository:

```bash
pi
```

```text
/verity doctor
```

`/verity doctor` checks extension load, Git repository, discovered ecosystem,
selected verification command, counterfactual baseline availability, and whether
automatic repair is disabled or enabled. It does **not** call an LLM, open the
network, or mutate the repository.

Work normally after that. No Verity-specific prompt is required. After a change,
inspect evidence with:

```text
/verity
/verity why
/verity receipt
/verity run
```

Short walkthrough: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Aha sequence

Pi Verity makes three outcomes obvious early:

| Moment | What you see | Meaning |
| ------ | ------------ | ------- |
| Weak test | `NON_DISCRIMINATING` → receipt `UNPROVEN` | Candidate test passes on baseline **and** candidate; it does not prove the patch |
| Strong test | baseline RED, candidate GREEN → `PROVEN` / `PASS` | Evidence depends on the change |
| Later edit | prior `PASS` becomes adapter state `STALE` | Repository state no longer matches the saved proof; re-run `/verity run` |

Core receipt verdicts are `PASS`, `PASS_WITH_WARNINGS`, `FAIL`, and `UNPROVEN`.
`STALE` is an adapter-visible state when the current repository no longer matches
a prior receipt — it is not a core receipt verdict.

Reproduce the sequence without a provider:

```bash
npm ci
npm run build
node examples/checkout-regression/demo.mjs
```

## Evidence at a glance

| Property | Status | Where |
| -------- | ------ | ----- |
| Baseline RED / candidate GREEN discrimination | automated | [docs/evidence/claim-matrix.md](docs/evidence/claim-matrix.md) |
| Non-discriminating test detection | automated | [docs/evidence/claim-matrix.md](docs/evidence/claim-matrix.md) |
| Stale proof detection | automated | [docs/evidence/claim-matrix.md](docs/evidence/claim-matrix.md) |
| Dirty baseline preserved (no clean-baseline claim) | automated | [docs/evidence/claim-matrix.md](docs/evidence/claim-matrix.md) |
| Read-only tool-call filtering | automated | [docs/evidence/claim-matrix.md](docs/evidence/claim-matrix.md) |
| Deterministic proof needs 0 LLM calls | recorded | [docs/evidence/performance.md](docs/evidence/performance.md) |
| Provider independence (two upstream providers) | blocked | [docs/evidence/provider-independence.md](docs/evidence/provider-independence.md) |

Full index: [docs/evidence/README.md](docs/evidence/README.md).

## Automatic repair is opt-in

By default Pi Verity **stops at evidence**. Deterministic `FAIL` / `UNPROVEN`
does not spend extra LLM tokens on automatic repair.

```bash
# default behavior (no auto-repair turns)
pi

# explicit opt-in: at most two same-session repair turns after consecutive FAIL
PI_VERITY_MAX_REPAIR_ATTEMPTS=2 pi
```

- Default: `0` (passive)
- Accepted: integer `0..10`
- `0` never triggers a repair turn; positive `N` allows at most `N` turns
- Invalid or negative values fall back to `0`; values above `10` clamp to `10`

## What v0.1 does

Pi Verity observes a Pi coding-agent change and independently:

1. binds proof to the actual repository change,
2. runs discovered deterministic repository checks,
3. tests whether candidate regression evidence discriminates baseline from
   candidate where an exact baseline workspace is available,
4. reports suspicious high-confidence test/change signals,
5. invalidates proof when the candidate state changes.

It does this without another reviewer model.

## What v0.1 deliberately does not do

- sandbox untrusted repository code
- provide cross-platform network isolation
- support non-Pi hosts
- provide repository policy configuration
- infer semantic correctness with another LLM
- claim npm publication (install from the GitHub release tag)

## The three questions

### 1. What actually changed?

Pi Verity does not trust a textual completion claim. It binds verification to
the observed Git state, the actual changed files, a baseline identity, and the
final repository-state hash.

### 2. Does the evidence depend on that change?

When tests change and an exact baseline workspace is available, Pi Verity checks
patch polarity:

```text
baseline implementation + candidate test -> FAIL (RED)
candidate implementation + candidate test -> PASS (GREEN)
```

If the candidate test passes against both implementations, it is
non-discriminating evidence — not strong proof of the patch.

### 3. Is the proof still valid?

A successful proof receipt is bound to the candidate repository state. If
relevant state changes afterward, the Pi adapter reports:

```text
PASS -> STALE
```

A receipt for an earlier patch is not proof for a later one.

## Why an execution gate?

A coding agent can produce a wrong implementation, weaken the test that should
catch it, and still report a green suite. Asking another model for an opinion
does not create independent evidence.

Pi Verity instead observes the repository, selects conservative deterministic
checks, records scope-integrity signals, evaluates counterfactual evidence where
applicable, and emits a state-bound `ProofReceipt`.

Weak agents are not made smarter. Unsupported completions are made harder to
pass.

## Pi commands

```text
/verity          show the current concise verdict
/verity run      execute verification now
/verity why      explain every selected check and emitted signal
/verity receipt  show the persisted receipt path and canonical JSON
/verity doctor   local readiness report (no LLM / network / mutation)
```

Successful automatic runs remain quiet. Warnings and failures are bounded:

```text
pi-verity ✓ 4 checks · 1.8s · proof: PASS

pi-verity ⚠ PASS_WITH_WARNINGS
dependency added · counterfactual proof unavailable
/verity why

pi-verity ✗ FAIL
targeted test failed
/verity why
```

Receipts are written with mode `0600` where supported under:

```text
~/.pi/agent/pi-verity/receipts/<repository-hash>/
```

## CLI

```bash
pi-verity verify [repository] \
  [--output receipt.json] \
  [--timeout-ms N] \
  [--max-output-bytes N]

pi-verity doctor [repository]
```

The CLI exits `0` for `PASS` and `PASS_WITH_WARNINGS`, and non-zero for `FAIL`
and `UNPROVEN`.

## Local development install

```bash
npm ci
npm run verify
pi install /absolute/path/to/pi-verity
```

## Architecture (below the fold)

```text
src/core/        deterministic verifier, no Pi or LLM dependency
src/adapter-pi/  thin lifecycle/command adapter
src/cli.ts       optional command-line entry point
```

See:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/PROOF_MODEL.md](docs/PROOF_MODEL.md)
- [docs/COUNTERFACTUAL_VERIFICATION.md](docs/COUNTERFACTUAL_VERIFICATION.md)
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)
- [docs/LIMITATIONS.md](docs/LIMITATIONS.md)
- [docs/ADAPTERS.md](docs/ADAPTERS.md)
- [examples/README.md](examples/README.md)

## Security note

Repository test/build scripts execute with your user privileges. Pi Verity
isolates counterfactual filesystem state and bounds process output; it is not an
OS sandbox. Use a container or VM for untrusted repositories.

## License

MIT
