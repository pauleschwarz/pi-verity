# Performance evidence

## Result

Recorded on one local machine. Numbers are environment-specific and are not a
performance guarantee.

## Reproduce

From the repository root:

```sh
npx tsx scripts/evidence/benchmark.ts
```

The script creates a temporary, disposable Git fixture and measures five
samples for each scenario:

1. `no-change` — clean repository; no verification subprocess is needed.
2. `small-source-patch` — source-only change; standard deterministic check.
3. `deterministic-proof` — source change with the deterministic check.
4. `counterfactual-proof` — source change with baseline/candidate proof.

JSON on stdout records per-sample wall-clock time, median, P95, verification
subprocess count, counterfactual workspace bytes, verdict/classification, and
the environment (OS, CPU, Node, npm, Git, Pi, and current commit). Absolute
home paths are not printed.

## Environment

| Field | Value |
| ----- | ----- |
| Generated at (UTC) | 2026-08-28T20:06:14.162Z |
| OS | darwin 25.5.0 arm64 |
| CPU | Apple M5 (10 logical) |
| Node | v22.23.2 |
| npm | 10.9.8 |
| Git | git version 2.55.0 |
| Pi | 0.84.3 |
| pi-verity commit | `231236e3cb2c039c36a516c0522e45fb574daeb3` |
| Sample count | 5 per scenario |
| Fixture size after setup | 32250 bytes |
| LLM calls | 0 |
| LLM tokens | 0 |

## Measured scenarios

| Scenario | Median wall-clock (ms) | P95 wall-clock (ms) | Verification subprocesses | Counterfactual workspace bytes | Verdict / classification |
| -------- | ---------------------: | ------------------: | ------------------------: | -----------------------------: | ------------------------ |
| no-change | 19 | 19 | 0 | 0 | PASS / none |
| small-source-patch | 215 | 231 | 1 | 0 | PASS / none |
| deterministic-proof | 217 | 219 | 1 | 0 | PASS / none |
| counterfactual-proof | 609 | 617 | 3 | 517 | PASS / `PROVEN_REGRESSION` |

### Sample wall-clock (ms)

| Scenario | Samples |
| -------- | ------- |
| no-change | 19, 19, 19, 19, 17 |
| small-source-patch | 231, 213, 215, 213, 216 |
| deterministic-proof | 217, 215, 219, 218, 214 |
| counterfactual-proof | 606, 617, 607, 611, 609 |

## LLM overhead

The benchmark invokes `verifyRepository` directly. It makes **0 LLM calls** and
uses **0 LLM tokens** by construction; the script records those values. This
measures deterministic proof only. It does not measure Pi startup, model
latency, an agent's patch-generation turn, or the optional repair loop. With
the passive default (`PI_VERITY_MAX_REPAIR_ATTEMPTS=0`), deterministic `FAIL`
does not trigger another agent turn. Positive repair limits are explicit and
must be benchmarked separately with a real Pi session; no such result is
claimed here.

## Method notes

- Subprocess counts come from receipt `verification_commands` plus the two
  counterfactual command runs when both baseline and candidate results exist.
  Fixture `git` preparation is excluded.
- Counterfactual workspace bytes come from Pi Verity's bounded workspace
  measurement (`baseline + candidate` copies of the tiny fixture).
- `small-source-patch` and `deterministic-proof` intentionally share the same
  source edit and deterministic path; they are listed separately so the
  four-scenario contract stays explicit. Their timings are expected to be
  nearly identical.
- Fixture test is a one-line Node test that fails on the baseline
  implementation and passes after the source patch.

## Limitations

- Five samples are a smoke benchmark, not a capacity or SLA claim.
- Temporary filesystem, CPU load, Node/Git version, and repository size affect
  results.
- Repair-loop latency and token cost are out of scope for this measurement.
- Provider/model latency is out of scope; the verifier is provider-agnostic.
