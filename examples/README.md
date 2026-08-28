# Examples

Current configuration is environment-based; there is no repository YAML parser.

```bash
# Disable automatic repair follow-ups.
PI_PROOF_MAX_REPAIR_ATTEMPTS=0 pi

# Run the CLI and persist canonical JSON explicitly.
pi-proof verify . --output proof-receipt.json

# Install a tagged GitHub release.
pi install git:github.com/pauleschwarz/pi-proof@v0.1.0
```

See [`docs/CONFIGURATION.md`](../docs/CONFIGURATION.md) for the complete shipped surface.
