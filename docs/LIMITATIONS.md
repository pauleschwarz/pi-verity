# Limitations

`pi-verity` deliberately avoids claims it cannot justify.

## Selected checks are not total correctness

A passing receipt means the selected deterministic checks passed for the recorded state. Zero-config discovery runs at most one standard repository command, not a complete CI matrix. Unknown bugs and untested behavior can remain.

## User intent is not inferred

A patch can satisfy tests while implementing the wrong requirement. The verifier does not use an LLM to infer ambiguous acceptance criteria.

## Counterfactual proof is partial

Baseline RED / candidate GREEN shows that a candidate test discriminates baseline from candidate behavior. It does not prove that the requirement is correct, edge cases are complete, or unrelated behavior did not regress.

Counterfactual evidence also requires a portable test and an exact baseline workspace. Dirty or unavailable baselines can make the result unavailable or inconclusive.

## Repository scripts are trusted code

Tests and build scripts can be malicious, destructive, networked, or secret-reading. They run with the user's privileges inside a filesystem copy, not a complete OS sandbox. The filesystem copy protects the original worktree from ordinary writes but does not isolate the rest of the machine.

## Network isolation is platform-dependent

Counterfactual network denial is enforced on macOS when the platform mechanism is available. Unsupported platforms report network policy as unavailable. The normal selected verification command is not network-isolated.

## Process cleanup has platform limits

Timeout and cancellation terminate bounded child processes. Complete descendant cleanup can vary by operating system and by processes that deliberately detach.

## Command output can contain secrets

Scope analysis never emits secret-like file contents. Repository commands control stdout and stderr, so receipt output can still contain credentials or source fragments. Receipt files should be treated as sensitive.

## Dynamic systems can be nondeterministic

Networked, distributed, timing-sensitive, GPU, browser, and integration tests may be flaky. The current implementation does not run repeated trials to estimate flakiness.

## Semantic analysis is conservative

Signals can detect recognizable skips, deletions, suppressions, dependency changes, generated files, migrations, public API declarations, secret-like paths, binaries, and broad spread. They cannot prove a change was necessary or unnecessary, and they do not understand every language construct.

## No shipped repository policy file

There is no `.pi-verity.yml` parser, custom command matrix, protected-path policy, or plugin interface. Configuration is limited to documented environment variables and CLI limits.

## Local receipts are not attestation

Receipts are not cryptographically signed. A user with filesystem access can modify them. `/verity` detects repository-state staleness, but external consumers remain responsible for artifact integrity.

## Models remain fallible

Failure evidence can guide the same agent through bounded repairs, but it cannot make a model capable of work outside that model's abilities. Strong models remain non-self-certifying.
