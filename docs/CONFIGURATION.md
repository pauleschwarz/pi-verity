# Configuration

`pi-verity` uses zero-config repository discovery in v0.1. Repository configuration is not supported in v0.1. `.pi-verity.yml` is reserved for a future explicit-policy format and is not read by the current implementation.

## Pi adapter environment

### `PI_VERITY_MAX_REPAIR_ATTEMPTS`

Maximum automatic same-agent follow-up turns after consecutive deterministic `FAIL` receipts.

- Default: `2`
- Accepted: integer `0..10`
- `0`: expose evidence without automatically triggering a repair turn
- Invalid or negative values: fall back to `2`
- Values above `10`: clamp to `10`

The counter resets after a non-`FAIL` receipt. Reaching the limit queues the bounded evidence for the same session without triggering another turn.

```bash
PI_VERITY_MAX_REPAIR_ATTEMPTS=1 pi
```

### `PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK`

Set exactly to `1` to allow network during counterfactual runs. If unset, counterfactual execution requests network denial. On macOS this is enforced by the platform runner; unsupported platforms report network policy as unavailable instead of claiming isolation.

```bash
PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK=1 pi
```

This variable does not restrict the repository's normal selected verification command. Repository commands are trusted code and can access the network.

## CLI options

```text
pi-verity verify [repository]
  [--output receipt.json]
  [--timeout-ms N]
  [--max-output-bytes N]
```

- `repository` defaults to the current directory.
- `--output` writes canonical JSON with file mode `0600` where supported.
- `--timeout-ms` must be positive.
- `--max-output-bytes` must be positive and bounds captured stdout/stderr.

## Command discovery

The current implementation does not accept custom repository commands. It conservatively selects at most one command:

1. Node script: `test`, `verify`, `check`, `typecheck`, then `lint`.
2. Python: pytest only when configured in `pyproject.toml`.
3. Rust: `cargo test`.
4. Go: `go test ./...`.

Potentially destructive Node script text is rejected. `pi-verity` never installs missing dependencies.

## Repository configuration

Repository configuration discovery is not shipped in `0.1.0`. `.pi-verity.yml` is reserved as the single canonical future filename, but it is not parsed or silently accepted today. No legacy configuration alias is supported because the project has not been publicly released.

A future repository configuration surface must be schema-validated, show selected commands in receipts, reject unknown keys, and treat configuration changes as proof-relevant evidence before it can be documented as available.
