# Security Policy

## Supported versions

No public release exists yet. Before the first release, fixes apply to the current default branch. After releases begin, this section will identify supported versions explicitly.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that could:

- execute unintended commands
- overwrite or delete user files
- expose credentials/source code
- escape configured repository boundaries
- corrupt proof receipts
- bypass a blocking verification policy

Use [GitHub private vulnerability reporting](https://github.com/pauleschwarz/pi-proof/security/advisories/new) after it is enabled for the repository.

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

`pi-proof` is not an OS sandbox.

Repository test/build scripts can execute arbitrary code with the user's privileges.

The project aims to make verification:

- bounded
- transparent
- non-destructive to the original worktree
- local by default
- free of product telemetry and verifier-owned external network calls

For the detailed threat model, see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Disclosure

Security fixes should avoid publishing exploit details before a patch is available where practical.
