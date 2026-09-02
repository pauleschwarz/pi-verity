# Plan: pi-verity docs & usability (2026-09-02)

Status: implemented in this pass (docs slice). Product/code follow-ups remain open.

## Problem

README is strong on *what* Verity is, weak on *who it's for*, *when to trust it*, and *how it fits next to other tools*. Install story is inconsistent (npm badge vs "not on npm"). First-run path and failure modes live only in deep docs.

## Goals

1. One-screen mental model: claim → evidence → verdict.
2. Honest install path (Git tag via `pi install`, no fake npm).
3. Clear "not this" boundaries vs visual-qa / LLM reviewers.
4. Usable command & status table without reading HOW_IT_WORKS.
5. Maintainer on-ramp (CONTRIBUTING) without expanding product surface.

## Non-goals

- Changing verification semantics, schemas, or CLI behavior.
- Publishing to npm in this pass.
- Rewriting HOW_IT_WORKS / LIMITATIONS wholesale.

## Gaps found (audit)

| Gap | Severity | Fix now? |
| --- | --- | --- |
| npm version badge though package is Git-only | high (trust) | yes — remove / replace with release badge |
| No "who / when" section | high | yes |
| No comparison to visual-qa / "another model reviews" | med | yes |
| Footer status values listed as prose only | med | yes — table |
| Commands present; no "start here" triage | med | yes — short decision tree |
| No CONTRIBUTING / SECURITY stub | low | yes — CONTRIBUTING minimal |
| homepage null on GitHub | low | open (repo setting) |
| Doctor / policy deep-links buried | low | yes — link GETTING_STARTED |
| examples/ not mentioned | low | yes — link |

## Implementation slices

### Slice A — README rewrite (this pass)

Acceptance:

- [x] Tagline + one-paragraph problem stay
- [x] Badges: CI + license; no npm-version-to-npmjs
- [x] Sections: Why / Install / What you see / Example / How it works / Catches / Commands / Limits / Related / Docs
- [x] Explicit: does not render UI; pairs with visual-qa for that
- [x] Links to GETTING_STARTED, HOW_IT_WORKS, LIMITATIONS, schemas, examples

### Slice B — CONTRIBUTING.md (this pass)

Acceptance:

- [x] Dev install, test command, doc map, "don't loosen soundness for green CI"

### Slice C — later (not this pass)

- Publish real npm package *or* keep Git-only and document forever
- FAQ from Infinity-run scratchpad items (SCOPE_TEST_DELETED, narrow(), BASELINE_UNAVAILABLE)
- GitHub homepage + Topics polish
- Short 60s GIF / asciinema of UNPROVEN → PROVEN

## Risks

- Over-promising "automatic" if doctor fails outside git repos — mitigated by doctor-first install steps.
- Docs drift from v0.2.0 behavior — pin install tag; link CHANGELOG.

## Verify

- [x] README renders; internal links exist on disk (scripted relative-link check)
- [x] No claim of npm publish; fake npm badge removed; Git-only callout
- [x] `package.json` / release tag `v0.2.0` matches install line
- [x] Pi upstream link → `earendil-works/pi`
- [x] CONTRIBUTING.md added
