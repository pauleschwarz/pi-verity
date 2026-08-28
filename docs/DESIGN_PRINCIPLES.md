# Design Principles

## 1. The agent is not the verifier

The model may explain a result, but it cannot certify its own work.

A statement such as:

```text
Implemented. Tests pass.
```

is not evidence until independently reproduced.

## 2. Prefer orthogonal evidence

More model opinions are often correlated, not independent.

Prefer:

```text
compiler
test runner
runtime
Git diff
static analyzer
counterfactual behavior
```

over:

```text
agent A opinion
agent B opinion
agent C summary
```

## 3. Green is necessary, not sufficient

A test suite can be green because:

- the wrong behavior was tested
- assertions were weakened
- the failing test was skipped
- tests never exercised the change
- the implementation and test encode the same misunderstanding
- the relevant test did not run

`pi-proof` therefore distinguishes "check passed" from "change proven".

## 4. Inconclusive is a first-class result

Never collapse:

```text
could not prove
```

into:

```text
passed
```

Use `UNPROVEN`.

## 5. Facts before heuristics

A signal must state what was observed.

Good:

```text
package.json gained one dependency
```

Bad:

```text
the agent added an unnecessary dependency
```

The latter requires intent judgment that may not be provable.

## 6. No magic quality score

Do not output:

```text
code quality: 87/100
```

unless every component is mathematically defined and reproducible.

Prefer named evidence and explicit verdict rules.

## 7. Do not solve slop with ceremony

No default:

- planner
- critic
- reviewer
- judge
- synthesizer

Each additional agent must prove measurable value before entering the default path.

## 8. Verification cost must buy information

A full build after a typo fix may be waste.

A browser smoke test after a UI routing change may be valuable.

The proof planner should select the smallest set that satisfies required dimensions.

## 9. Strong models do not bypass proof

Model quality may influence execution strategy outside `pi-proof`.

It must not make proof requirements disappear.

```text
weak model    -> same proof semantics
frontier model -> same proof semantics
```

## 10. Weak models should receive concrete failure evidence

Do not send:

```text
please review your implementation carefully
```

Send:

```text
FAIL
command: npm test -- auth
file: auth.test.ts
expected: 401
received: 200
```

## 11. Preserve the user's workspace

Verification must not casually:

- reset
- stash
- clean
- commit
- push
- rewrite unrelated files

Counterfactual work belongs in an isolated workspace.

## 12. Zero hidden network behavior

No telemetry, analytics, cloud judge, or remote upload by default.

Any network-requiring verification must be explicit.

## 13. Explain every decision

`/proof why` must explain:

- why a check ran
- why it was skipped
- why a warning fired
- why the final verdict was produced

## 14. Policies do not autonomously rewrite themselves

Adaptive verification may recommend changes from observed evidence.

It must not silently weaken required checks because historical failures were rare.

## 15. The core must outlive Pi

Pi is the first adapter, not the product boundary.

The durable product is:

> proof semantics for coding-agent patches.
