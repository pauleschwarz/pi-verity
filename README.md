# Verity

**Deterministic proof-of-done for coding-agent patches.**

[![CI](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml/badge.svg)](https://github.com/pauleschwarz/pi-verity/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f766e.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/pauleschwarz/pi-verity?label=release)](https://github.com/pauleschwarz/pi-verity/releases)

A coding agent can write the patch, the test, and the "tests pass" conclusion.
Verity checks whether the repository evidence actually supports that conclusion.

It does not ask another model to grade the work. It runs deterministic checks,
compares candidate tests against the pre-change code when an exact baseline is
available, detects weakened evidence, and writes a receipt bound to the final
repository state.

```text
agent patch → repository evidence → PASS | WARN | UNPROVEN | FAIL → receipt
```

## Start here

Verity is a harness-neutral CLI and TypeScript core. Any agent that can run a
subprocess can use it.

```bash
npm install --save-dev github:pauleschwarz/pi-verity#v0.2.0
npx verity doctor .
npx verity verify . --output verity-receipt.json
```

The package is Git-tag distributed today; it is not yet in the npm registry.
`pi-verity` remains a fully supported legacy binary alias during migration.

### Pi adapter (optional)

[Pi](https://github.com/earendil-works/pi) can run Verity automatically after
repository-changing turns:

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.2.0
```

Then, inside a Git working tree:

```text
/verity doctor
```

Pi is the first adapter, not a dependency of the verification core. Adapter
imports are available at both the canonical
`@pauleschwarz/pi-verity/adapters/pi` path and the legacy `./adapter-pi` path.

## Why Verity

| Common check | What it misses | Verity adds |
| --- | --- | --- |
| "The tests are green" | The new test may also pass on old code | Counterfactual RED → GREEN classification |
| LLM code review | Non-deterministic judgment | Repository commands and machine-readable evidence |
| CI success | Evidence may be stale after another edit | Receipt bound to final repository state |
| Agent self-report | Same actor produced claim and proof | Independent deterministic verdict path |

## The core example

A weak regression test:

```text
new test on old code      PASS
new test on patched code  PASS

NON_DISCRIMINATING_TEST → UNPROVEN
```

A discriminating regression test:

```text
new test on old code      FAIL
new test on patched code  PASS

PROVEN_REGRESSION → PASS
```

New APIs often cannot run meaningfully on the baseline. Verity records
`TEST_NOT_PORTABLE` rather than treating an import/compile error as fake proof.
If the exact baseline workspace was not captured, it says
`BASELINE_UNAVAILABLE`.

## Verdicts

| What you see | Machine verdict | Meaning |
| --- | --- | --- |
| Proven | `PASS` | Required checks for this patch passed |
| Proven, with notes | `PASS_WITH_WARNINGS` | Passed, but something still needs attention |
| Not proven | `UNPROVEN` | Evidence missing, inconclusive, or out of date — do not claim done |
| Failed | `FAIL` | A required check or blocking integrity signal failed |

A receipt records commands, bounded output, changed files, counterfactual
classification, scope integrity, test delta, observable effects, optional
external evidence, and the final state hash. Current receipts use
[`proof-receipt.v5`](schemas/proof-receipt.v5.schema.json); v3 and v4 remain
frozen for existing consumers.

## How it works

```text
host / coding agent
        ↓ invokes CLI or core API
Verity discovers a safe repository command
        ↓
runs checks in an isolated workspace
        ↓
checks scope + test delta + optional counterfactual/effects
        ↓
writes state-bound receipt and exit code
```

Core verification has no Pi SDK, browser runtime, model provider, daemon, or
network service dependency.

Detailed mechanics: [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

## Harness integration

The stable minimal contract is:

```bash
verity verify /path/to/repo --output receipt.json
```

- stdout: canonical receipt JSON when no `--output` is supplied
- stderr: concise verdict line
- exit `0`: `PASS` or `PASS_WITH_WARNINGS`
- exit `1`: `FAIL`
- exit `2`: `UNPROVEN`, invalid invocation, or blocked environment

TypeScript:

```ts
import { verifyRepository } from "@pauleschwarz/pi-verity";

const receipt = await verifyRepository({ cwd: process.cwd() });
```

See [Harness integration](docs/HARNESS_INTEGRATION.md) for adapters and a
copy-paste agent loop.

## Pi automation

With the optional Pi adapter, Verity:

- captures the pre-change workspace before repository mutation
- verifies after the agent settles
- stays quiet on clean PASS
- skips full verification for docs-only edits
- exposes `/verity`, `/verity why`, `/verity run`, `/verity doctor`,
  `/verity policy`, and `/verity receipt`
- keeps a persistent `verity` status in the footer

The optional execution policy is adapter-specific because enforcement requires
a trustworthy pre-tool hook:

```bash
PI_VERITY_EXECUTION_POLICY=mutating pi
PI_VERITY_EXECUTION_POLICY=all pi
```

The legacy environment prefix remains for compatibility. Other adapters must
not claim execution enforcement unless their host exposes an equivalent hook.

## What Verity catches

- candidate tests that also pass on old code
- candidate tests that fail on the candidate
- skipped or deleted tests and removed assertions
- mechanical test weakening
- selected user-stated observable claims contradicted in source
- stale receipts after the repository changes
- deterministic test, typecheck, lint, scope, timeout, and cancellation failures
- absent evidence without pretending it passed

## Limits

Verity does not prove overall correctness, architecture quality, product taste,
or complete test coverage. It does not render a web UI. Repository scripts run
with your user privileges; Verity is not an OS sandbox. Counterfactual network
denial is currently available only on macOS.

For browser-observable behavior, use
[visual-qa](https://github.com/pauleschwarz/visual-qa). Its conservative Verity
integration is tracked in the
[harness-neutral migration plan](docs/plans/2026-09-03-verity-harness-neutral.md).

Precise boundaries: [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Compatibility during the rename

| Canonical surface | Legacy surface kept working |
| --- | --- |
| Product: **Verity** | Historical "Pi Verity" release text |
| Binary: `verity` | `pi-verity` |
| Pi adapter: `./adapters/pi` | `./adapter-pi` |
| CLI/core usable by any harness | Existing Pi auto-load metadata |

The npm package name, GitHub repository URL, receipt v3/v4 URNs, saved receipt
paths, Pi status keys, and session entry IDs remain unchanged. Current receipts
write schema v5 with optional `external_evidence`; v3 and v4 stay readable.

## Docs

- [Getting started](docs/GETTING_STARTED.md)
- [Harness integration](docs/HARNESS_INTEGRATION.md)
- [How it works](docs/HOW_IT_WORKS.md)
- [Limitations](docs/LIMITATIONS.md)
- [Examples](examples/README.md)
- [Evidence](docs/evidence/README.md)
- [Migration plan](docs/plans/2026-09-03-verity-harness-neutral.md)
- [Contributing](CONTRIBUTING.md)

## Development

Requires Node 20+.

```bash
git clone https://github.com/pauleschwarz/pi-verity.git
cd pi-verity
npm ci
npm run verify
```

## License

MIT — [LICENSE](LICENSE).
