# Security Policy

## Supported versions

The current `v0.1.x` release line is supported. Security fixes apply to the current default branch and the latest published release.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that could:

- execute unintended commands
- overwrite or delete user files
- expose credentials/source code
- escape configured repository boundaries
- corrupt proof receipts
- bypass a blocking verification policy

Use [GitHub private vulnerability reporting](https://github.com/pauleschwarz/pi-verity/security/advisories/new) after it is enabled for the repository.

If private vulnerability reporting is not enabled, the maintainer should configure a dedicated security contact before the first public stable release.

## What to include

Provide:

- affected version/commit
- operating system
- reproduction steps
- expected vs observed behavior
- impact
- minimal repository fixture if possible

Do not include real secrets.

## Security model

Pi Verity protects proof integrity and isolates counterfactual filesystem state. It is not an OS sandbox.

Repository test/build scripts execute with your user privileges, just as they would when run directly from the shell. Use a container or VM when verifying untrusted repositories.

Counterfactual network isolation is currently available on macOS only. On unsupported platforms the receipt explicitly reports `network_policy: unavailable`. The normal selected verification command is not network-isolated.

The project aims to make verification bounded, transparent, non-destructive to the original worktree, local by default, and free of product telemetry and verifier-owned external network calls.

For the execution boundary and residual risks, see
[How it works](https://github.com/pauleschwarz/pi-verity/blob/main/docs/HOW_IT_WORKS.md#bounded-execution)
and
[Limitations](https://github.com/pauleschwarz/pi-verity/blob/main/docs/LIMITATIONS.md#repository-scripts-are-trusted-code).

## Disclosure

Security fixes should avoid publishing exploit details before a patch is available where practical.
