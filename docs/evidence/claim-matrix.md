# Claim matrix

Each row maps a public claim to deterministic automated evidence in the current
checkout.

| Claim | Test / fixture | Expected | Result |
| --- | --- | --- | --- |
| Regression evidence depends on the patch | `counterfactual.test.ts` — useful regression | baseline RED, candidate GREEN, `PROVEN_REGRESSION`, `PASS` | PASS |
| A weak test is rejected as proof | `counterfactual.test.ts` — always-passing test | `NON_DISCRIMINATING_TEST`, `UNPROVEN` | PASS |
| New API evidence is not fake RED | `counterfactual.test.ts` — candidate-only API | structural baseline failure, `TEST_NOT_PORTABLE`, no automatic `UNPROVEN` | PASS |
| Broken candidate remains a failure | `counterfactual.test.ts` — broken candidate | `CANDIDATE_FAILS`, `FAIL` | PASS |
| Missing exact baseline is explicit | `counterfactual.test.ts` — changed test without workspace baseline | `BASELINE_UNAVAILABLE`, `UNPROVEN` | PASS |
| Counterfactual timeout cannot pass | `counterfactual.test.ts` — bounded slow test | `INCONCLUSIVE`, never passing | PASS |
| Read-only tool calls do not trigger proof | `adapter-pi.lifecycle.test.ts` — read-only call | no state change, no proof run | PASS |
| Repository-changing calls are detected | `adapter-pi.lifecycle.test.ts` — mutating call | changed repository is verified | PASS |
| A later edit invalidates proof | `adapter-pi.test.ts` — receipt state identity | adapter reports stale | PASS |
| Dirty baseline is preserved | `verifier.test.ts` — dirty baseline | warning; no clean-baseline claim | PASS |
| Skipped tests block proof | `counterfactual.test.ts` — skipped failing test | `TEST_SKIPPED`, `FAIL` | PASS |
| Deleted tests block proof | `counterfactual.test.ts` — deleted test | `TEST_DELETED`, `FAIL` | PASS |
| Removed assertions are visible | `counterfactual.test.ts` — weakened assertion | `ASSERTION_REMOVED` | PASS |
| Deterministic proof needs no LLM | `doctor.test.ts` and core architecture | local-only verifier path | PASS |
