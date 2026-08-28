# Evidence Matrix

This matrix links each product claim to deterministic automated evidence. `Result`
remains `PASS` records a successful run in the current checkout. `PENDING` means the claim still needs a recorded run.

| Claim | Test / Fixture | Expected | Result |
| ----- | -------------- | -------- | ------ |
| candidate state is observed independently | `test/counterfactual.test.ts` — useful regression | baseline RED, candidate GREEN | PASS |
| read-only tool calls do not cause false verification | `test/adapter-pi.lifecycle.test.ts` — read-only tool call | no state change, no proof run | PASS |
| mutating tool calls are detected | `test/adapter-pi.lifecycle.test.ts` — mutating tool call | changed repository is verified | PASS |
| candidate test may be non-discriminating | `test/counterfactual.test.ts` — useless always-passing test | `NON_DISCRIMINATING`, `UNPROVEN` | PASS |
| baseline RED / candidate GREEN is recognized | `test/counterfactual.test.ts` — useful regression | `PROVEN_REGRESSION`, `PASS` | PASS |
| stale proof is invalidated | `test/adapter-pi.test.ts` — receipt state identity | stale state is detected | PASS |
| dirty baseline is preserved | `test/verifier.test.ts` — dirty baseline | dirty warning, no clean-baseline claim | PASS |
| no LLM call is required for deterministic proof | `test/doctor.test.ts` — doctor | local-only capability report | PASS |
| skipped tests emit an integrity signal | `test/counterfactual.test.ts` — skipped failing test | `TEST_SKIPPED`, `FAIL` | PASS |
| deleted tests emit an integrity signal | `test/counterfactual.test.ts` — deleted test | `TEST_DELETED`, `FAIL` | PASS |
| removed assertions emit an integrity signal | `test/counterfactual.test.ts` — weakened assertion | `ASSERTION_REMOVED` | PASS |
