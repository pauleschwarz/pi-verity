# Limitations

Pi Verity deliberately avoids claims it cannot justify.

## Passing is not total correctness

A passing receipt means the selected deterministic checks passed for the
recorded repository state. Zero-config discovery runs at most one standard
command, not a complete CI matrix. Unknown bugs and untested behavior can
remain.

## Product intent is not inferred

A patch can satisfy tests while implementing the wrong requirement. Verity does
not use an LLM to decide whether vague acceptance criteria, architecture, UX,
or product intent are good.

## Counterfactual proof is partial

Baseline RED and candidate GREEN shows that a candidate test distinguishes old
and new behavior. It does not prove the requirement is correct, the test is
complete, or unrelated behavior did not regress.

Counterfactual applicability is also conservative. Pi Verity recognizes common
missing-module, import, export, and symbol diagnostics as structural
`TEST_NOT_PORTABLE` failures. Toolchains can phrase those failures differently,
so an unfamiliar diagnostic may remain `INCONCLUSIVE` or may require manual
interpretation. A test that happens to run on baseline can still be conceptually
irrelevant; Verity cannot infer that intent.

An exact pre-change workspace is required. When expected candidate tests exist
but that workspace was not captured, the result is `BASELINE_UNAVAILABLE`, not
fabricated RED evidence.

## Repository scripts are trusted code

Tests and build scripts can be malicious, destructive, networked, or
secret-reading. They run with the user's privileges inside a filesystem copy,
not an OS sandbox. The copy protects the original worktree from ordinary writes
but does not isolate the rest of the machine. Use a container or VM for
untrusted repositories.

## Network isolation is platform-dependent

Counterfactual network denial is enforced on macOS when the platform mechanism
is available. Unsupported platforms report network policy as unavailable. The
normal selected repository command is not network-isolated.

## Process cleanup has platform limits

Timeout and cancellation terminate bounded child processes. Complete descendant
cleanup can vary by OS and for processes that deliberately detach.

## Command output can contain secrets

Scope analysis does not emit secret-like file contents. Repository commands
control stdout and stderr, so receipts can still contain credentials or source
fragments. Treat receipt files as sensitive.

## Dynamic systems can be nondeterministic

Networked, distributed, timing-sensitive, GPU, browser, and integration tests
may be flaky. Verity does not repeat trials to estimate flakiness.

## Static signals are conservative

Scope and anti-gaming rules recognize specific syntax and paths. They do not
understand every language construct and cannot prove that a change was
necessary or unnecessary.

## Configuration is intentionally small

There is no repository policy file, custom command matrix, protected-path DSL,
plugin interface, dashboard, or cloud service. Configuration is limited to the
documented environment variables and CLI bounds.

## Receipts are not attestation

Receipts are local and unsigned. A user with filesystem access can edit them.
The Pi adapter detects repository-state staleness, but external consumers remain
responsible for artifact integrity.

## Models remain fallible

Concrete failure evidence can help the same agent repair a patch, but it cannot
make the model understand a requirement it does not understand. A stronger
model is still not independent proof.
