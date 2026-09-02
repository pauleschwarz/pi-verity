# Limitations

Pi Verity deliberately avoids claims it cannot justify.

## Execution policy is Pi-bound

Pre-execution enforcement covers agent tool calls that pass through Pi's
supported `tool_call` extension hook. It does not govern direct user shell
commands, processes started outside Pi, or another host without an adapter.

## Other extensions matter

Pi runs `tool_call` handlers in extension load order. Earlier handlers can
mutate the input before Verity sees it; Verity asks approval for that effective
input. After approval, Verity recursively freezes the JSON-shaped input object
that Pi's current agent loop later executes. A later in-place mutation therefore
fails or has no effect, and the originally approved object remains unchanged.

This relies on Pi's current same-object execution semantics. Verity does not
claim protection from a malicious extension that bypasses Pi's hook, tampers
with shared runtime internals, or otherwise runs code directly. Extension
updates should re-check this ordering and object-identity assumption.

## Local policy audit is not attestation

`pi-verity-policy` entries are local session evidence. An actor with the same
filesystem permissions can modify them. They are not signed or remotely
attested.

## No reasoning inspection

Verity does not read or judge private model reasoning. Natural-language intent
cannot create an approval; the gate enforces observable runtime decisions only.

## Not an OS sandbox

An approved tool still runs with the privileges of the underlying Pi process.
Execution approval is not process isolation, capability restriction, or a
container boundary.

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
fabricated RED evidence. The planner refuses to select counterfactual comparison
without that baseline; absence of comparison is explicit evidence, not a silent
skip.

## Effect evidence is bounded and partial

`effect_evidence` records what a cheap sensor could observe for each extracted
claim. Source observation is a bounded text scan: it stops at a maximum file
count and file size, skips common vendor and build directories, and can only
support presence, absence, or literal value claims. `SOURCE_OBSERVED` therefore
means found in source, not true at runtime. Runtime observation is only recorded
when a runtime sensor was actually supplied; otherwise the claim stays
`UNCHECKED`, which is an explicit absence of evidence, not a pass.

Claims and expected values are Verity-owned. Agent-supplied probe hints are
location-only and can never introduce an expected value or a verdict.

## Test delta is mechanical, not qualitative

`test_delta` counts files, assertions, skips, and suppressions with
syntax-level rules. `weakened: true` observes that evidence shrank; it does not
prove the patch is wrong, and `weakened: false` does not prove test quality.
Renames, moves, and generated tests can distort the counts.

## Command narrowing is conservative

Counterfactual runs prefer to execute only the candidate test. When the
discovered command uses shell expansion, pipelines, or its own glob, narrowing
cannot be verified and `narrowing` is `unverified`: the full suite may run, so
an unrelated failure can influence the classification. Treat `unverified`
narrowing as weaker counterfactual evidence.

## Verification workspaces omit dependencies

Disposable copies exclude `.git` and `node_modules`. Checks that require locally
installed executables or vendored dependencies can fail or be reported as
inconclusive in the copy even though they pass in the original worktree.

## Repository scripts are trusted code

Tests and build scripts can be malicious, destructive, networked, or
secret-reading. They run with the user's privileges inside a filesystem copy,
not an OS sandbox. The copy protects the original worktree from ordinary writes
but does not isolate the rest of the machine. Use a container or VM for
untrusted repositories.

## Network isolation is platform-dependent

Counterfactual network denial is enforced on macOS via `sandbox-exec`, which
Apple has deprecated. It works today, but when a future macOS release removes
it, counterfactual network denial degrades to the unsupported path: the run is
reported as `INCONCLUSIVE` with `network_policy: unavailable`, never as a
silent pass. To keep counterfactual proof working on such a system, run with
`PI_VERITY_ALLOW_COUNTERFACTUAL_NETWORK=1` and accept that the counterfactual
command can reach the network. Unsupported platforms report network policy as
unavailable. The normal selected repository command is not network-isolated.

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
