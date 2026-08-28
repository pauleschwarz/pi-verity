# Provider independence

## Result

BLOCKED

## Scope and finding

No two genuinely independent, directly configured upstream providers were
available for a safe two-provider run. The local Pi model configuration exposes
one `omniroute` provider route (`http://localhost:20128/v1`); model names or
fallback routes behind that endpoint would not constitute independent
providers. No provider request was made. This report therefore does not fake a
comparison or claim portability evidence that was not generated.

Pi Verity's deterministic proof semantics remain provider-agnostic: the core
receives repository state and verification options, not provider credentials or
model identity.

## Reproducible test design

- **Pi version:** not recorded; provider run blocked.
- **pi-verity commit:** `9f12b2a` (passive-repair hardening commit; provider run
  was not performed).
- **Provider A / model A:** not run.
- **Provider B / model B:** not run.
- **Fixture:** sanitized temporary Git repository containing one deterministic
  test; no private repository contents are included.
- **Task:** ask each provider to make the same small source change that makes
  the fixture test pass; generated patches may differ.
- **Receipt schema:** version 3 in the current implementation.
- **Selected checks:** Git state capture, discovered deterministic test, and
  exact baseline/candidate counterfactual execution when available.
- **Verdict semantics:** receipts use `PASS`, `PASS_WITH_WARNINGS`, `FAIL`, or
  `UNPROVEN`; rules do not depend on provider/model identity.
- **Stale semantics:** the adapter reports a prior receipt as `STALE` when the
  current repository state no longer matches it; `STALE` is not a core receipt
  verdict.
- **Counterfactual semantics:** required baseline/candidate polarity proves
  dependence; a test passing on both sides is `NON_DISCRIMINATING` and does not
  prove the patch.

## Unblock procedure

Configure two direct, genuinely independent upstream providers (for example,
direct OpenAI plus direct Anthropic, or a direct provider plus local Ollama).
Run the same fixture/task through both, record provider/model names only, and
compare the resulting proof semantics rather than requiring byte-identical
receipts. Never record keys, headers, credential paths, or private absolute
paths.
