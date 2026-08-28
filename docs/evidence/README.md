# Public evidence index

This directory holds recorded evidence for Pi Verity claims. Prefer the
automated test suite as the primary proof source; the documents below record
additional portability and performance observations that are either automated,
recorded once, or explicitly blocked.

| Document | Kind | Status | What it covers |
| -------- | ---- | ------ | -------------- |
| [claim-matrix.md](./claim-matrix.md) | automated | PASS rows recorded against current tests | Core product claims mapped to unit/lifecycle fixtures |
| [provider-independence.md](./provider-independence.md) | blocked | `BLOCKED` | Two-provider independence check; only one local OmniRoute provider was configured, so no independence run was performed |
| [performance.md](./performance.md) | recorded | measured on one machine | Wall-clock median/P95 for no-change, small patch, deterministic proof, and counterfactual proof; 0 LLM calls/tokens on the deterministic path |
| [performance.json](./performance.json) | recorded | raw output of the benchmark | Machine-readable companion to `performance.md` |
| [readme-truth-audit.md](./readme-truth-audit.md) | recorded | release audit | README claims labeled proven / limited / planned / blocked |
| [integration-audit-v0.1.1.md](./integration-audit-v0.1.1.md) | recorded | release audit | Full automated + manual gate log for v0.1.1 |

## How to regenerate performance evidence

```sh
npx tsx scripts/evidence/benchmark.ts
```

Redirect or copy the JSON into `docs/evidence/performance.json` and refresh the
tables in `performance.md` only with values produced by that run. Do not invent
latency, disk, or token numbers.

## How to unblock provider independence

Configure two genuinely independent upstream providers (for example direct
OpenAI and direct Anthropic, or a direct provider plus local Ollama). Two model
names behind a single OmniRoute proxy do not count. Run the same fixture and
task through both, then replace the `BLOCKED` verdict in
`provider-independence.md` with `PROVEN_WITH_TWO_INDEPENDENT_PROVIDERS` or
`PARTIALLY_PROVEN` and document sanitized provider/model names only.

## Integrity rules

- No secrets, API keys, tokens, headers, or private absolute paths.
- Byte-identical receipts across providers are not required; proof semantics
  (verdict, stale, counterfactual classification) are.
- `STALE` is an adapter-visible state when the repository no longer matches a
  prior receipt; it is not a core receipt verdict.
- Deterministic proof does not require an LLM. Optional repair is opt-in via
  `PI_VERITY_MAX_REPAIR_ATTEMPTS` and is out of scope for the performance smoke
  benchmark above.
