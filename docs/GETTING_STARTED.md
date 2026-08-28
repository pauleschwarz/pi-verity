# Getting started

Five steps from install to first useful evidence. No clone or build is required
for normal use.

## 1. Install

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.1
```

This loads the Pi extension from the immutable GitHub release tag. npm
publication is not claimed.

## 2. Check

Inside a Git repository:

```bash
pi
```

```text
/verity doctor
```

Expect a local readiness report covering:

- extension loaded
- git repository
- discovered ecosystem
- selected verification command
- counterfactual baseline availability
- automatic repair disabled or enabled

Doctor does not call an LLM, open the network, or mutate the repository.

## 3. Work normally

Continue your usual agent session. No Verity-specific prompt is required. When
the agent mutates the repository, Pi Verity observes the change and runs
discovered deterministic checks. Read-only tool calls do not trigger a proof
run.

Automatic repair is **off by default**. Deterministic `FAIL` stops at evidence
and does not spend extra LLM turns unless you opt in:

```bash
PI_VERITY_MAX_REPAIR_ATTEMPTS=2 pi
```

## 4. Understand results

| Outcome | Meaning |
| ------- | ------- |
| `PASS` | Deterministic checks succeeded for the bound repository state |
| `PASS_WITH_WARNINGS` | Passed with bounded warnings (for example dirty baseline or missing counterfactual) |
| `FAIL` | A selected check failed or a high-confidence integrity signal blocked the proof |
| `UNPROVEN` | Evidence is insufficient — for example a non-discriminating test |
| `STALE` (adapter state) | Current repository state no longer matches a prior receipt; re-run `/verity run` |

Aha sequence:

1. Weak always-passing test → `NON_DISCRIMINATING` → `UNPROVEN`
2. Baseline RED / candidate GREEN → `PROVEN` → `PASS`
3. Edit after a successful proof → adapter reports `STALE`

Offline demo of that sequence:

```bash
npm ci && npm run build && node examples/checkout-regression/demo.mjs
```

## 5. Debug

```text
/verity          concise current verdict
/verity why      every selected check and emitted signal
/verity receipt  receipt path + canonical JSON
/verity run      run verification now
/verity doctor   readiness again
```

CLI equivalents:

```bash
pi-verity doctor .
pi-verity verify . --output proof-receipt.json
```

## Next reading

- [Evidence index](evidence/README.md)
- [Configuration](CONFIGURATION.md)
- [Proof model](PROOF_MODEL.md)
- [Limitations](LIMITATIONS.md)
