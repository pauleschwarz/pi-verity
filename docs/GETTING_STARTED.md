# Getting started

Install once, use Pi normally, inspect Verity only when you need detail.

## Install

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.2
```

The package is installed from the GitHub release tag. Pi Verity is not
published to npm.

Inside a Git repository:

```bash
pi
```

```text
/verity doctor
```

Doctor reports extension load, Git readiness, the discovered ecosystem and
check, baseline availability, and whether automatic repair is enabled. It does
not call an LLM, open the network, or mutate the repository.

## Work normally

No Verity prompt is required. Before an agent turn, the Pi adapter captures the
repository state. If the turn uses a repository-changing tool, Verity checks
the resulting patch after the agent settles. Read-only turns do not create
receipts. A successful automatic run is concise; problems include the next
useful command.

## Read a result

| Result | Meaning |
| --- | --- |
| `PASS` | Every required deterministic dimension selected for this patch passed |
| `PASS_WITH_WARNINGS` | Required checks passed, with explicit non-blocking facts |
| `FAIL` | A selected command, candidate check, or blocking integrity signal failed |
| `UNPROVEN` | Required evidence was missing, inconclusive, or non-discriminating |
| `STALE` | Adapter state only: the repository changed after the saved receipt |

Counterfactual classifications are more specific:

| Classification | Meaning | Verdict effect by itself |
| --- | --- | --- |
| `PROVEN_REGRESSION` | Candidate test is RED on baseline and GREEN on candidate | satisfied |
| `NON_DISCRIMINATING_TEST` | Candidate test passes on both | `UNPROVEN` |
| `TEST_NOT_PORTABLE` | Candidate test cannot execute meaningfully on baseline | none; other dimensions decide |
| `BASELINE_UNAVAILABLE` | Exact pre-change workspace was not captured | `UNPROVEN` when that evidence was expected |
| `CANDIDATE_FAILS` | Candidate does not pass its own evidence | `FAIL` |
| `INCONCLUSIVE` | Execution timed out, was cancelled, or could not be trusted | `UNPROVEN` |

For a new API, `TEST_NOT_PORTABLE` is often the honest result. Verity does not
pretend a missing import or symbol is a useful regression failure.

## Inspect or rerun

```text
/verity          concise current verdict
/verity why      selected checks, signals, and verdict reasons
/verity run      run verification now
/verity doctor   local readiness report
/verity receipt  persisted path and canonical receipt JSON
```

The optional CLI uses the same core:

```bash
pi-verity doctor .
pi-verity verify . --output proof-receipt.json
```

CLI options:

```text
pi-verity verify [repository]
  [--output FILE]
  [--timeout-ms N]
  [--max-output-bytes N]
```

## Configuration

Repository configuration files and custom command matrices are not supported.
Zero-config discovery selects at most one command:

1. Node: `test`, `verify`, `check`, `typecheck`, then `lint`
2. Python: configured pytest
3. Rust: `cargo test`
4. Go: `go test ./...`

Potentially destructive Node script text is rejected. Verity never installs
missing dependencies.

Two environment variables are supported:

```bash
# Off by default. Allow at most two same-session repair turns after FAIL.
PI_VERITY_MAX_REPAIR_ATTEMPTS=2 pi

# Explicitly allow network in counterfactual runs.
PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK=1 pi
```

`PI_VERITY_MAX_REPAIR_ATTEMPTS` accepts `0..10` and defaults to `0`.
Counterfactual network denial is enforced on macOS only. On unsupported
platforms, a denied-network counterfactual is reported as inconclusive rather
than falsely isolated. The normal repository check is not network-isolated.

## Reproduce the demo

```bash
npm ci
npm run build
node examples/checkout-regression/demo.mjs
```

The demo shows a non-discriminating test, a proven regression, and stale proof
after another edit.

Next: [How it works](HOW_IT_WORKS.md), [Limitations](LIMITATIONS.md), and the
[Evidence index](evidence/README.md).
