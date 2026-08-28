# Roadmap

The roadmap is ordered to protect the project's core thesis from feature creep.

## Phase 0 — Reconnaissance (complete)

- verify current Pi extension APIs
- verify Pi package/distribution behavior
- survey overlapping Pi extensions
- lock core/adapter boundary
- define fixture strategy
- define ProofReceipt v1

**Exit condition:** no implementation depends on remembered or assumed Pi APIs.

## Phase 1 — Deterministic MVP (implemented, pre-release validation in progress)

Deliver:

- baseline capture
- diff capture and identity
- command discovery
- bounded command runner
- proof receipt
- four verdicts
- Pi commands
- Node + one additional ecosystem
- zero telemetry

**Explicitly excluded:**

- LLM reviewer
- subagents
- adaptive learning
- browser automation
- cloud service

## Phase 2 — Anti-slop integrity (implemented for high-confidence signals)

Deliver high-confidence signals:

- dependency addition
- test deletion
- test skip/disable
- assertion removal where supported
- lint/type suppression
- config/build changes
- broad file spread
- verifier-policy change

Signals must report facts, not subjective conclusions.

## Phase 3 — Counterfactual proof (implemented)

Deliver:

- isolated baseline execution
- candidate-test overlay
- baseline/candidate classification
- dirty-baseline safety
- cleanup/cancellation
- counterfactual receipt data

This phase establishes the project's primary differentiator.

## Phase 4 — Risk-adaptive proof planning (future)

Select the minimal required verification set from:

- changed paths/types
- repository structure
- public API/config/dependency signals
- test availability
- explicit project policy

Requirements:

- explainable
- deterministic
- policy-overridable
- never uses model reputation as proof input

## Phase 5 — Runtime adapters

Potential adapters:

- HTTP service smoke
- browser/UI smoke
- database migration checks
- containerized execution

Each runtime adapter must remain optional.

## Phase 6 — Empirical proof efficiency

Collect local aggregate statistics:

```text
change fingerprint
check selected
duration
failure detected
```

Use them to recommend verification-policy changes.

Do **not** silently self-modify mandatory verification policy.

## Phase 7 — Additional hosts

After the core API stabilizes, evaluate:

- standalone CLI
- GitHub Action
- other coding-agent adapters

Do not duplicate proof logic per host.

## Not on roadmap without evidence

- autonomous multi-agent review
- vector database
- long-term semantic memory
- model leaderboard inside the verifier
- automatic model routing
- cloud dashboard
- autonomous policy rewriting

A feature may enter the roadmap only after a concrete use case demonstrates that the core cannot solve it more simply.
