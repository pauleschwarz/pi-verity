# Pi Adapter and Model Independence

## Product boundary

`pi-verity` verifies repository state and deterministic command evidence. It does not evaluate models as model objects.

The core is independent of:

- provider
- model family
- reasoning level
- routing strategy
- subscription or API-key mechanism

## Shipped Pi adapter

`src/adapter-pi/index.ts` is the only host adapter currently shipped. It uses Pi's public extension lifecycle, command, UI, session-entry, and custom-message APIs.

It captures a baseline before an agent turn, observes repository-capable tools, verifies after the agent settles, and exposes:

```text
/verity
/verity run
/verity why
/verity receipt
/verity doctor
```

Successful automatic verification is quiet. Warnings and failures are concise. A deterministic `FAIL` always exposes bounded evidence. Automatic same-session repair turns are **opt-in** via `PI_VERITY_MAX_REPAIR_ATTEMPTS` (default `0`). When enabled, at most the configured number of follow-up repair turns may run. No secondary agent is created.

## Why there are no provider adapters

```text
Pi executes any selected model
        |
        v
repository state
        |
        v
same deterministic verifier core
```

Provider metadata is neither required nor privileged. A router may change its backing model without changing verdict rules.

## Compatibility claim

Model independence is an architectural property of the verifier core. Host compatibility still depends on Pi's extension API and must be smoke-tested against the Pi version used for release. Release evidence should identify the exact Pi build and model routes tested rather than claiming universal compatibility.

## Future adapters

The exported core can be reused by another host, but Codex, Claude Code, GitHub Action, and remote-service adapters are roadmap ideas, not shipped features.
