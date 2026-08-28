# Counterfactual Verification

## Problem

Agent-authored tests are not automatically independent evidence.

A model can encode the same misunderstanding twice:

```text
wrong implementation
+
test that asserts the wrong behavior
```

Both may pass.

## Core property

For a regression fix with a candidate test, the strongest simple evidence is:

```text
baseline implementation + candidate test  -> FAIL
candidate implementation + candidate test -> PASS
```

This demonstrates that the candidate test detects behavior changed by the patch.

It does **not** prove the requirement itself is correct, but it significantly reduces false confidence from non-discriminating tests.

## Classifications

### `PROVEN_REGRESSION`

Candidate test fails on baseline and passes on candidate.

### `NON_DISCRIMINATING_TEST`

Candidate test passes on both baseline and candidate.

This test must not be counted as counterfactual proof.

### `CANDIDATE_FAILS`

Candidate test fails on candidate.

### `BASELINE_UNAVAILABLE`

The baseline cannot be reconstructed safely.

### `TEST_NOT_PORTABLE`

The candidate test cannot run meaningfully against the baseline.

Examples:

- test depends on new API that does not exist at baseline
- fixtures require candidate-only schema
- import graph cannot be reconciled safely

### `INCONCLUSIVE`

Execution did not produce reliable evidence.

Examples:

- timeout
- cancellation
- nondeterministic result
- external service unavailable

`INCONCLUSIVE` must never become PASS.

## Safe execution model

Never rewrite the original working tree to perform a counterfactual test.

Preferred strategy:

1. capture baseline identity
2. create isolated worktree/temp checkout
3. materialize baseline implementation
4. overlay the minimum candidate test delta
5. run the narrowest relevant test
6. record result
7. run the equivalent candidate test in the candidate workspace
8. compare
9. clean up isolated state

## Dirty baselines

Dirty baselines require special handling.

The verifier must not pretend `HEAD` equals the user's starting state if local modifications existed before the task.

Implementation options must be evaluated carefully:

- snapshot relevant files
- temporary index/tree
- patch-based baseline reconstruction
- isolated copy

The chosen mechanism must preserve the user's original state and be covered by tests.

## Candidate-test identification

Do not assume every changed test is a regression test.

Potential evidence:

- test file added
- test file modified
- repository framework mappings
- explicit configuration
- proximity between changed production/test paths

When uncertain, mark counterfactual applicability as unresolved rather than inventing certainty.

## Test weakening

Counterfactual proof is not enough if existing tests were weakened.

High-confidence signals should detect:

- active test -> skipped/disabled
- assertion removed
- test deleted
- broad ignore mechanism introduced
- expected error converted to unconditional success

Semantic assertion-strength comparison is language/framework-specific and should be conservative.

Never claim an assertion was "weakened" unless a rule can prove the transformation.

Otherwise report the factual change:

```text
ASSERTION_REMOVED
```

## Failure examples

### Non-discriminating

```text
baseline + new test  PASS
candidate + new test PASS
```

Verdict contribution:

```text
counterfactual: NON_DISCRIMINATING_TEST
```

### Useful regression proof

```text
baseline + new test  FAIL
candidate + new test PASS
```

Verdict contribution:

```text
counterfactual: PROVEN_REGRESSION
```

### Broken candidate

```text
baseline + new test  FAIL
candidate + new test FAIL
```

Verdict contribution:

```text
counterfactual: CANDIDATE_FAILS
```

## Limits

Counterfactual verification does not prove:

- the user's requirement was interpreted correctly
- no other behavior regressed
- production environments match the test environment
- the test is comprehensive
- the patch is secure

It is one orthogonal proof dimension, not a universal oracle.
