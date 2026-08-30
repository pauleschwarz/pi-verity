# Evidence

The automated test suite is the primary evidence. This directory keeps the
small amount of recorded evidence that is useful outside the tests.

| Evidence | Status | Covers |
| --- | --- | --- |
| [Claim matrix](claim-matrix.md) | PASS | Product claims mapped to deterministic fixtures |
| [Performance](performance.md) · [raw JSON](performance.json) | recorded | Median/P95 measurements and 0 LLM calls on the deterministic path |
| [Provider independence](provider-independence.md) | BLOCKED | No claim based on two routes behind one provider |
| [v0.1.4 release](release-v0.1.4.md) | recorded | Proof planner, exact-baseline gating, ambient diff-first summaries |
| [v0.1.3 release](release-v0.1.3.md) | recorded | Git-install fix, full gate, package, Pi load, and demo |
| [v0.1.2 release](release-v0.1.2.md) | superseded | Semantics/docs release; Git-source install regression fixed in v0.1.3 |
| [v0.1.1 release](integration-audit-v0.1.1.md) | recorded | Historical release gate |

## Reproduce

Core claims:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm pack --dry-run
```

Performance evidence:

```bash
npx tsx scripts/evidence/benchmark.ts
```

Only update performance numbers from an actual run. Provider independence
requires two genuinely independent upstream providers; two OmniRoute model
names do not count.

## Integrity rules

- No secrets, tokens, headers, or private absolute paths.
- A blocked check stays blocked; missing evidence is never rewritten as PASS.
- `STALE` is adapter state, not a core receipt verdict.
- Deterministic verification requires no LLM. Optional same-agent repair is a
  separate, opt-in path.
