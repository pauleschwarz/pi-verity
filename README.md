# Pi Verity

**Your agent says it's done. Verity checks the evidence.**

A coding agent can write the implementation, the test, and the "tests pass"
conclusion. Pi Verity puts a deterministic gate between that claim and your
trust in the patch.

It does not ask another model whether the code looks good. It checks the
repository.

## Install

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.3
```

Then use Pi normally. Inside a Git repository, check the installation once:

```text
/verity doctor
```

That's it. Verity watches repository-changing agent turns, runs the checks it
can prove, and stays quiet when they pass.

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
agent changes repository
        ↓
Verity binds evidence to that repository state
        ↓
runs one conservative repository-defined check
        ↓
checks scope and test-integrity signals
        ↓
checks baseline/candidate polarity when it is meaningful
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
- stale receipts after the repository changes again
- deterministic test, typecheck, lint, and scope failures
- missing or inconclusive evidence without pretending it passed

## Commands

```text
/verity          current concise verdict
/verity why      checks, signals, and verdict reasons
/verity run      run verification now
/verity doctor   local readiness check
/verity receipt  receipt path and canonical JSON
```

These commands are for inspection. They are not a workflow you must remember.
Automatic repair is off by default; see
[Getting started](docs/GETTING_STARTED.md) if you want to opt in.

## Limits

Verity does not know whether the architecture is elegant, the UX is good, a
vague requirement was interpreted correctly, or every unknown bug is gone.
Repository scripts still run with your user privileges; Verity is not an OS
sandbox.

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

```bash
npm ci
npm run verify
npm run build
```

MIT
