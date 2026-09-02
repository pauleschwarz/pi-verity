# Contributing to pi-verity

## Principles

1. **Soundness over green CI.** Do not loosen a blocking check, schema, or
   verdict rule to make a flaky scenario pass. Fix the scenario or mark it
   honestly `UNPROVEN` / `INCONCLUSIVE`.
2. **Receipts are API.** Additive fields are preferred; breaking
   `proof-receipt` shape needs a schema version bump and CHANGELOG entry.
3. **No LLM in the verdict path.** Deterministic checks only for PASS/FAIL
   evidence. Models may help *write* tests elsewhere; they do not grade them
   here.

## Setup

```bash
git clone https://github.com/pauleschwarz/pi-verity.git
cd pi-verity
npm ci
npm test
```

Requires Node 20+ and a Git checkout (many checks assume a real repo).

Install the local build into Pi via your usual `pi install` / link workflow
pointing at this tree or a release tag — see README.

## Project map

| Path | Role |
| --- | --- |
| `src/` | Extension + verification core |
| `schemas/` | Receipt JSON Schema (v3/v4) |
| `docs/` | User and maintainer docs |
| `examples/` | Scenario fixtures |
| `test/` | Automated tests |
| `harness/` | Integration / harness helpers |

## Docs changes

- User-facing behavior → `README.md` + `docs/GETTING_STARTED.md`
- Semantics / dimensions → `docs/HOW_IT_WORKS.md`
- Explicit non-claims → `docs/LIMITATIONS.md`
- Process plans → `docs/plans/`

## PRs

- Keep diffs focused; don't mix soundness fixes with drive-by refactors.
- Add or update tests for any verdict/schema change.
- Run `npm test` before pushing.
- Note receipt schema impact in the PR body when relevant.

## Security

Report sensitive issues privately to the maintainer (GitHub security
advisory on this repo preferred). Do not file public issues that include
secrets or customer data.
