# Threat Model

## Scope

`pi-verity` executes verification inside software repositories potentially modified by an AI coding agent.

That creates two classes of untrusted input:

1. repository contents
2. agent-produced changes

The verifier itself runs with the user's operating-system privileges unless externally sandboxed. Repository test/build scripts execute with the user's privileges, just as they would when run directly from the shell.

`pi-verity` is **not** an OS sandbox. Use a container or VM when verifying untrusted repositories.

## Assets

Protect:

- user's working tree
- uncommitted work
- credentials/environment variables
- filesystem outside the repository
- network services
- Git history/remotes
- proof integrity
- local machine availability

## Threats

### T1 — destructive repository command

A discovered or configured command could delete files or mutate state.

Mitigations:

- explicit command provenance in receipt
- conservative auto-discovery
- no generated destructive commands
- configurable execution policy
- optional external sandboxing

Residual risk:

Repository-defined test/build scripts can execute arbitrary code.

### T2 — malicious repository

A repository may intentionally contain:

- malicious lifecycle scripts
- malicious test commands
- symlink tricks
- huge outputs
- fork bombs
- credential exfiltration

Mitigations:

- time limits
- output limits
- child-process cleanup
- network denial for isolated counterfactual execution on macOS only; unsupported platforms report `network_policy: unavailable`
- path canonicalization
- no automatic package install

Residual risk:

Running arbitrary repository scripts without an OS/container sandbox remains dangerous. Pi Verity does not protect the host machine from malicious repository code.

### T3 — verifier damages dirty worktree

Mitigations:

- capture dirty baseline
- no reset/stash/clean on original workspace
- counterfactual execution in isolated workspace
- integration tests for staged/unstaged/untracked states

### T4 — stale proof reused

Mitigations:

- bind receipt to candidate diff/state digest
- invalidate on relevant file change
- display stale state explicitly

### T5 — agent games the verifier

Examples:

- skip/delete test
- weaken assertion
- add lint suppression
- alter verifier config
- alter CI scripts
- change proof policy

Mitigations:

- scope/integrity signals
- treat verifier config changes as high-sensitivity changes
- optionally require external policy for protected verifier files
- counterfactual testing
- receipt contains policy/config digest

### T6 — secret leakage in captured output

Mitigations:

- bounded capture
- configurable redaction
- do not upload receipts by default
- document storage path
- avoid raw environment dumps

### T7 — network exfiltration

Mitigations:

- no telemetry
- no verifier-owned external network calls by default
- counterfactual network disabled by default
- surface commands requiring network access when known

### T8 — denial of service

Mitigations:

- wall-clock timeout
- output cap
- temp-storage cap
- bounded parallelism
- cancellation propagation
- process-tree termination

## Trust boundaries

```text
trusted-ish:
  pi-verity code + explicitly chosen policy

untrusted:
  repository
  model output
  changed scripts
  tests
  generated code

external/uncontrolled:
  compilers
  package managers
  network services
  OS process behavior
```

## Security invariant

A successful proof receipt means:

> the configured verification completed under the recorded conditions.

It must never be marketed as:

> this patch is secure.

## Vulnerability reporting

See the repository-level `SECURITY.md`.
