# Examples

## Checkout regression

The canonical Golden Demo lives in [`checkout-regression/`](checkout-regression/).
It runs without network access:

```bash
node examples/checkout-regression/demo.mjs
```

The demo evaluates two candidate states:

- `weak`: `freeShipping(50)` is not covered. Tests pass on baseline and candidate → `NON_DISCRIMINATING`, `UNPROVEN`.
- `strong`: `freeShipping(50)` is covered. Baseline fails, candidate passes → `PROVEN`, `PASS`.

After the strong proof, the implementation is mutated. The saved proof state no longer matches → `STALE`.

## CLI

```bash
# Deterministic diagnostic; no LLM, network, or repository mutation.
pi-verity doctor .

# Run the CLI and persist canonical JSON explicitly.
pi-verity verify . --output proof-receipt.json
```
