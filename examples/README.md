# Examples

## Checkout regression

The canonical Golden Demo lives in [`checkout-regression/`](checkout-regression/).
It runs without network access or a model provider:

```bash
node examples/checkout-regression/demo.mjs
```

The demo evaluates two candidate states:

- `weak`: `freeShipping(50)` is not covered. Tests pass on baseline and
  candidate → `NON_DISCRIMINATING`, receipt `UNPROVEN`.
- `strong`: `freeShipping(50)` is covered. Baseline fails, candidate passes →
  `PROVEN`, receipt `PASS`.

After the strong proof, the implementation is mutated. The saved proof state no
longer matches → adapter state `STALE`.

This is the same aha sequence described in the root README and
[docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md).

## First-use path (no demo required)

```bash
pi install git:github.com/pauleschwarz/pi-verity@v0.1.0
pi   # inside a Git repository
```

```text
/verity doctor
```

Then work normally. Inspect evidence with `/verity`, `/verity why`,
`/verity receipt`, or `/verity run`. Automatic repair stays off unless you set
`PI_VERITY_MAX_REPAIR_ATTEMPTS` to a positive integer.

## CLI

```bash
# Deterministic diagnostic; no LLM, network, or repository mutation.
pi-verity doctor .

# Run the CLI and persist canonical JSON explicitly.
pi-verity verify . --output proof-receipt.json
```
