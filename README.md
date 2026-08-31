# Pi Verity

**Your agent says it's done. Verity checks the evidence.**

[![npm](https://img.shields.io/npm/v/@pauleschwarz/pi-verity)](https://www.npmjs.com/package/@pauleschwarz/pi-verity)
[![CI](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml/badge.svg)](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml)

A coding agent can write the implementation, the test, and the "tests pass"
conclusion. Pi Verity puts a deterministic gate between that claim and your
trust in the patch.

It does not ask another model whether the code looks good. It checks the
repository.

## Install

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.2.0
```

Then use Pi normally. Inside a Git repository, check the installation once:

```text
/verity doctor
```

That's it. From here, Verity runs itself:

- watches repository-changing agent turns and plans only the checks a patch can
  actually prove
- stays quiet when checks pass — no notifications, messages, or transcript
  entries
- skips full verification for docs-only edits
- keeps ambient PASS lines to one fact line: files, `+added/-removed`,
  milliseconds
- shows a keyed `pi-verity` status in the Pi footer: `observing`,
  `change pending`, `verifying`, `proven`, `warning`, `unproven`, `failed`, or
  `blocked`

## Optional execution policy

Verity can also enforce approval before agent tools run.

```bash
PI_VERITY_EXECUTION_POLICY=all pi
```

`all` requires explicit approval for every tool call. `mutating` allows known
read-only tools and gates side-effect-capable or unknown tools. `off` is the
default.

A denied call is blocked before execution. Later model reasoning does not count
as renewed permission; a new protected call requires a new explicit approval.
This is deterministic execution control, not chain-of-thought inspection.

## A test that proves nothing

An agent fixes a boundary bug, adds a test, and reports green.

```text
$ /verity

UNPROVEN

new test on old code      PASS
new test on patched code  PASS

NON_DISCRIMINATING
That test does not actually prove the patch.
```

After the real regression test is added:

```text
old code      FAIL
patched code  PASS

PROVEN
```

This is strongest for bug fixes and regressions. New functionality can have a
different shape:

```text
Add CSV export.
```

If the candidate test imports an API that does not exist in the baseline,
there is no meaningful RED run to claim. Verity records `TEST_NOT_PORTABLE`
and lets the other applicable checks decide the verdict. It does not turn an
import or compile failure into fake regression proof.

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
PASS, PASS_WITH_WARNINGS, FAIL, or UNPROVEN
```

Counterfactual proof is one evidence dimension, not a universal requirement:

- baseline RED + candidate GREEN → `PROVEN_REGRESSION`
- baseline PASS + candidate PASS → `NON_DISCRIMINATING_TEST`
- candidate-only API prevents a meaningful baseline run → `TEST_NOT_PORTABLE`
- exact baseline missing → `BASELINE_UNAVAILABLE`
- candidate check fails → `CANDIDATE_FAILS`

A non-portable counterfactual does not by itself make a patch `UNPROVEN`.
Missing required evidence, an inconclusive run, or a non-discriminating test
still does.

## What it catches

- green tests that also pass on the old implementation
- candidate tests that fail on the candidate
- skipped or deleted tests and removed assertions
- mechanical test weakening (`test_delta.weakened`)
- user-stated observable claims contradicted in source (`effect_evidence`)
- stale receipts after the repository changes again
- deterministic test, typecheck, lint, and scope failures
- missing or inconclusive evidence without pretending it passed

Observable claims are extracted from the user's own wording (quoted copy,
literal style/value/visibility). The agent may only supply location hints via
`verity_check`; expected values and the final verdict stay with Verity. Source
observation is not a rendered-UI guarantee.

## Commands

```text
/verity          current concise verdict
/verity why      checks, signals, and verdict reasons
/verity run      run verification now
/verity doctor   local readiness and policy configuration
/verity policy   execution policy and recent decisions
/verity receipt  receipt path and canonical JSON
```

Receipts follow [`schemas/proof-receipt.v4.schema.json`](schemas/proof-receipt.v4.schema.json);
receipts written by v0.1.5 and earlier follow the unchanged
[v3 schema](schemas/proof-receipt.v3.schema.json).

These commands are for inspection. They are not a workflow you must remember.
Automatic repair is off by default; see
[Getting started](docs/GETTING_STARTED.md) if you want to opt in.

## Limits

Verity does not know whether the architecture is elegant, the UX is good, a
vague requirement was interpreted correctly, or every unknown bug is gone.
It does not start browsers or app runtimes, so it cannot prove what a user
would see after render. Repository scripts still run with your user privileges;
Verity is not an OS sandbox.

**Verity doesn't know whether your code is brilliant. It knows whether the
evidence you have actually supports the change you made.**

See [Limitations](docs/LIMITATIONS.md) for the precise boundaries.

## Evidence

- [Tests and claim matrix](docs/evidence/claim-matrix.md): PASS
- [Deterministic path](docs/evidence/performance.md): 0 extra LLM calls
- [Counterfactual regression fixture](docs/evidence/claim-matrix.md): PASS
- [Release evidence](docs/evidence/README.md)

## Deeper docs

- [Getting started](docs/GETTING_STARTED.md)
- [How it works](docs/HOW_IT_WORKS.md)
- [Limitations](docs/LIMITATIONS.md)
- [Evidence index](docs/evidence/README.md)
- [Examples](examples/README.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security](.github/SECURITY.md)

## Development

Requires Node 20+.

```bash
npm ci
npm run verify   # typecheck, lint, tests, built-dist parity
npm run build
```

MIT
