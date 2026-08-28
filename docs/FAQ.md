# FAQ

## Does Pi Verity ask another model to review the patch?

No. Pi Verity is an execution gate, not a model reviewer.

It calls no LLM. It interprets deterministic evidence from Git state, one conservatively selected repository command, scope integrity, and counterfactual behavior when applicable.

## Why not just use CI?

Use CI too.

`pi-verity` operates in the interactive agent loop and can catch failures before a patch is presented as complete. CI remains the authoritative integration gate for many teams.

## Why not ask a stronger model to review the weak model?

A strong reviewer can help on semantic/architectural questions, but it adds cost and correlated judgment.

`pi-verity` focuses on evidence that does not require another model.

## Does it work with every Pi model?

The architecture is intended to be model-agnostic because proof is based on repository state rather than provider APIs.

Compatibility with a Pi version still depends on the Pi adapter using that version's public extension API.

## Can a model game it?

Potentially.

That is why the design includes:

- counterfactual verification
- test skip/delete signals
- suppression signals
- config/policy change signals
- diff-bound receipts

It is not a formally secure adversarial verifier.

## Does baseline RED / candidate GREEN prove the patch is correct?

No.

It proves the candidate test discriminates baseline from candidate behavior.

The requirement itself may still be wrong or incomplete.

## Why `UNPROVEN`?

Because "could not verify" and "verified failure" are different facts.

Collapsing both into PASS or FAIL destroys useful information.

## Will it slow Pi down?

Some proof costs time.

The project goal is to spend verification cost only when it buys useful evidence and to measure overhead before making performance claims.

## Does it modify the working tree?

Verification preserves the user's original workspace. Standard and counterfactual commands run in disposable filesystem copies.

## Does it send source code anywhere?

The product itself sends no source code, telemetry, or analytics. Repository-defined verification commands remain trusted code and may access the network or inherited environment.

## Can this work outside Pi?

The core is intentionally Pi-independent.

The shipped CLI uses the same core proof engine. Additional host adapters are possible but are not included.
