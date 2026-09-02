# Pi Verity

**Your agent says it's done. Verity checks the evidence.**

[![CI](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml/badge.svg)](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/pauleschwarz/pi-verity?label=release)](https://github.com/pauleschwarz/pi-verity/releases)

A coding agent can write the implementation, the test, and the "tests pass"
conclusion. **Pi Verity** puts a deterministic gate between that claim and your
trust in the patch.

It does **not** ask another model whether the code looks good. It checks the
repository: tests, typecheck, lint, scope, counterfactual proof, and
user-stated observables — then writes a receipt.

> Install is **Git-tag only** today (`pi install git:…@v0.2.0`). The package
> name is `@pauleschwarz/pi-verity`, but it is **not** published to the npm
> registry yet.

## Who this is for

| You… | Verity helps by… |
| --- | --- |
| Run [Pi](https://github.com/earendil-works/pi) (or a Pi-compatible harness) on real repos | Auto-verifying agent turns that touch the tree |
| Don't trust "tests pass" from the same agent that wrote the tests | Counterfactual checks (old code vs new test, etc.) |
| Want a machine-readable proof artifact | Writing versioned **receipts** under a stable schema |
| Need a kill-switch before dangerous tools | Optional **execution policy** (`off` / `mutating` / `all`) |

**Not for:** taste, architecture elegance, product judgment, or "what the UI
looks like after render". For browser-level proof, pair with
[visual-qa](https://github.com/pauleschwarz/visual-qa).

## Install

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.2.0
```

Then, inside a **Git** working tree:

```text
/verity doctor
```

Doctor checks extension load, Git readiness, discovered checks, baseline
availability, and policy — no LLM, no network, no repo mutation.

From here Verity runs itself on repository-changing turns:

- plans only the checks the patch can actually prove
- stays quiet on clean PASS (one ambient fact line: files, `+n/-n`, ms)
- skips full verification for docs-only edits
- shows a keyed `pi-verity` status in the Pi footer

Full first-run detail: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

### Optional execution policy

```bash
PI_VERITY_EXECUTION_POLICY=all pi        # approve every tool call
PI_VERITY_EXECUTION_POLICY=mutating pi   # gate side-effect / unknown tools
# default: off
```

A denied call is blocked **before** execution. Later model prose is not renewed
permission — each protected call needs a fresh explicit approval. This is
deterministic execution control, not chain-of-thought inspection.

## What you see (footer + verdicts)

| Footer / result | Meaning |
| --- | --- |
| `observing` | Watching; no pending mutating turn |
| `change pending` | Repo-touching turn in flight |
| `verifying` | Checks running |
| `proven` / `PASS` | Required dimensions for this patch passed |
| `warning` / `PASS_WITH_WARNINGS` | Required passed; non-blocking facts noted |
| `unproven` / `UNPROVEN` | Evidence missing, inconclusive, or non-discriminating |
| `failed` / `FAIL` | A selected check or blocking integrity signal failed |
| `blocked` | Could not run (e.g. policy / environment) |

Inspect anytime:

```text
/verity          current concise verdict
/verity why      checks, signals, verdict reasons
/verity run      verify now
/verity doctor   readiness + policy
/verity policy   execution policy + recent decisions
/verity receipt  receipt path + canonical JSON
```

Receipts: [`schemas/proof-receipt.v4.schema.json`](schemas/proof-receipt.v4.schema.json)
(v0.1.5 and earlier: [v3](schemas/proof-receipt.v3.schema.json)).

## A test that proves nothing

An agent "fixes" a boundary bug, adds a test, and reports green:

```text
$ /verity

UNPROVEN

new test on old code      PASS
new test on patched code  PASS

NON_DISCRIMINATING
That test does not actually prove the patch.
```

After a real regression test:

```text
old code      FAIL
patched code  PASS

PROVEN
```

Strongest for bug fixes and regressions. New APIs often cannot RED on baseline:

```text
Add CSV export.
```

If the candidate test imports an API that does not exist in baseline, Verity
records `TEST_NOT_PORTABLE` and lets **other** applicable checks decide. It does
not turn an import/compile failure into fake regression proof.

## How it works

```text
agent requests action
        ↓
optional Verity execution policy
        ↓
tool executes
        ↓
repository changes
        ↓
Verity binds and checks repository evidence
        ↓
PASS | PASS_WITH_WARNINGS | FAIL | UNPROVEN
        + proof receipt
```

Counterfactual dimension (one axis among several):

| Signal | Meaning |
| --- | --- |
| `PROVEN_REGRESSION` | baseline RED + candidate GREEN |
| `NON_DISCRIMINATING_TEST` | baseline PASS + candidate PASS |
| `TEST_NOT_PORTABLE` | candidate-only API; no meaningful baseline RED |
| `BASELINE_UNAVAILABLE` | exact pre-change baseline missing |
| `CANDIDATE_FAILS` | new check fails on the candidate |

A non-portable counterfactual alone does **not** force `UNPROVEN`. Missing
required evidence, an inconclusive run, or a non-discriminating test still can.

Deep dive: [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

## What it catches

- green tests that also pass on the old implementation
- candidate tests that fail on the candidate
- skipped or deleted tests and removed assertions
- mechanical test weakening (`test_delta.weakened`)
- user-stated observable claims contradicted in source (`effect_evidence`)
- stale receipts after the repository changes again
- deterministic test, typecheck, lint, and scope failures
- missing or inconclusive evidence without pretending it passed

Observable claims come from the **user's** wording (quoted copy, literal
style/value/visibility). The agent may only supply location hints via
`verity_check`; expected values and the final verdict stay with Verity.
Source observation is **not** a rendered-UI guarantee.

## Limits

Verity does not know whether the architecture is elegant, the UX is good, a
vague requirement was interpreted correctly, or every unknown bug is gone.
It does not start browsers or app runtimes. Repository scripts still run with
your user privileges; Verity is not an OS sandbox.

**Verity doesn't know whether your code is brilliant. It knows whether the
evidence you have actually supports the change you made.**

Precise boundary: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Related tools

| Tool | Layer |
| --- | --- |
| **pi-verity** (this) | Repo evidence after agent edits |
| [visual-qa](https://github.com/pauleschwarz/visual-qa) | Running web app: explore, find, fix, prove in a browser |
| [obsidian2date](https://github.com/pauleschwarz/obsidian2date) | Research window → durable Obsidian notes |

## Docs map

| Doc | Use when |
| --- | --- |
| [Getting started](docs/GETTING_STARTED.md) | Install, doctor, repair opt-in, first failures |
| [How it works](docs/HOW_IT_WORKS.md) | Dimensions, planning, receipts |
| [Limitations](docs/LIMITATIONS.md) | What Verity will never claim |
| [examples/](examples/) | Fixture-style scenarios |
| [CHANGELOG](CHANGELOG.md) | What changed per release |
| [Plan: docs usability](docs/plans/2026-09-02-docs-usability.md) | Why this README looks like this |

## Develop

```bash
git clone https://github.com/pauleschwarz/pi-verity.git
cd pi-verity
npm ci
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — [LICENSE](LICENSE).
