# Getting started

Install once, run the harness-neutral CLI from any agent, or add the Pi adapter
for automatic turn verification.

## CLI (any harness)

```bash
npm install --save-dev github:pauleschwarz/pi-verity#v0.2.0
npx verity doctor .
npx verity verify . --output verity-receipt.json
```

The package is installed from the GitHub release tag. Verity is not published
to npm yet. `pi-verity` remains a legacy binary alias.

Doctor reports core availability, Git readiness, discovered checks, baseline
availability, and isolated-workspace support. It does not call an LLM, open the
network, or mutate the repository.

## Pi adapter (automatic)

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.2.0
```

Inside a Git repository:

```bash
# Existing behavior; execution policy is off by default.
pi

# Optional adapter-specific pre-tool approval.
PI_VERITY_EXECUTION_POLICY=mutating pi
PI_VERITY_EXECUTION_POLICY=all pi
```

```text
/verity doctor
```

The Pi doctor output adds adapter, repair, and execution-policy readiness.

## Work normally

With the Pi adapter, no Verity prompt is required. Before an agent turn, the
adapter captures repository state. If the turn uses a repository-changing tool,
Verity checks the resulting patch after the agent settles. Read-only turns do
not create receipts. A successful automatic run is concise; problems include
the next useful command.

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
/verity doctor   local readiness and policy configuration
/verity policy   execution policy and recent decisions
/verity receipt  persisted path and canonical receipt JSON
```

The optional CLI uses the same core:

```bash
verity doctor .
verity verify . --output proof-receipt.json
```

CLI options:

```text
verity verify [repository]
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

Three environment variables are supported:

```bash
# off (default), mutating, or all.
PI_VERITY_EXECUTION_POLICY=mutating pi

# Off by default. Allow at most two same-session repair turns after FAIL.
PI_VERITY_MAX_REPAIR_ATTEMPTS=2 pi

# Explicitly allow network in counterfactual runs.
PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK=1 pi
```

`mutating` exempts only known read-only tools (`read`, `grep`, `find`, and `ls`);
side-effect-capable and unknown tools require approval. `all` requires Pi's
explicit confirmation for every agent tool call. If confirmation UI is
unavailable, protected calls are denied without waiting. Invalid policy values
are reported by `/verity doctor` and use fail-safe `all` behavior.

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
