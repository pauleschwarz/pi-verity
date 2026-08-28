# README truth audit (v0.1.1)

Labels: `IMPLEMENTED_AND_PROVEN` | `IMPLEMENTED_BUT_LIMITED` | `PLANNED` | `BLOCKED`

| Claim | Label | Evidence |
| ----- | ----- | -------- |
| Tag install without clone/build | IMPLEMENTED_AND_PROVEN | `pi` package manifest + GitHub source install path; docs use `git:github.com/pauleschwarz/pi-verity@v0.1.1` |
| `/verity doctor` local readiness, no LLM/network/mutation | IMPLEMENTED_AND_PROVEN | `src/core/doctor.ts`, lifecycle doctor test, CLI `pi-verity doctor` |
| Doctor reports automatic repair disabled/enabled | IMPLEMENTED_AND_PROVEN | adapter `repairStatus()` appended to doctor output; lifecycle assertion |
| Default repair limit is `0` (passive) | IMPLEMENTED_AND_PROVEN | `configuredRepairLimit()` + lifecycle test "unset repair limit is passive by default" |
| Opt-in repair via `PI_VERITY_MAX_REPAIR_ATTEMPTS` | IMPLEMENTED_AND_PROVEN | adapter + CONFIGURATION + lifecycle limit tests |
| Core verdicts PASS / PASS_WITH_WARNINGS / FAIL / UNPROVEN | IMPLEMENTED_AND_PROVEN | `src/core/types.ts`, verifier/counterfactual tests |
| Adapter STALE when repo no longer matches receipt | IMPLEMENTED_AND_PROVEN | adapter state + Golden Demo + claim-matrix |
| NON_DISCRIMINATING → UNPROVEN | IMPLEMENTED_AND_PROVEN | counterfactual tests + Golden Demo + claim-matrix |
| Baseline RED / candidate GREEN → PROVEN / PASS | IMPLEMENTED_AND_PROVEN | counterfactual tests + Golden Demo + claim-matrix |
| Read-only tool calls do not trigger verification | IMPLEMENTED_AND_PROVEN | lifecycle test |
| Mutating tool calls trigger verification | IMPLEMENTED_AND_PROVEN | lifecycle test |
| Dirty baseline warning, no clean-baseline claim | IMPLEMENTED_AND_PROVEN | verifier test + claim-matrix |
| Deterministic proof uses 0 LLM calls | IMPLEMENTED_AND_PROVEN | core has no provider dependency; performance benchmark records 0/0 |
| Performance numbers in docs | IMPLEMENTED_BUT_LIMITED | single-machine 5-sample smoke run in `performance.md` / `performance.json` |
| Provider independence across two upstream providers | BLOCKED | only one local OmniRoute provider configured; see `provider-independence.md` |
| npm package publication | PLANNED | not authorized; install from Git tag only |
| OS sandbox / cross-platform network isolation | PLANNED / limited | explicit non-goals in README and SECURITY |
| Non-Pi host adapters | PLANNED | ADAPTERS roadmap only |
