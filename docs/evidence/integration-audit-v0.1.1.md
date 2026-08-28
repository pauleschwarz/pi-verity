# Integration audit v0.1.1

Date: 2026-08-28
Branch: `main` (fast-forward of `agent-b-passive-repair`; A/B/C work landed as sequential commits on one branch)
Head before release commit: `88c20d9`

## Automated gate

| Check | Result |
| ----- | ------ |
| `npm ci` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` (61) | PASS |
| `npm run build` | PASS |
| `npm pack --dry-run` | PASS (`pauleschwarz-pi-verity-0.1.1.tgz`, 70 files) |

## Manual / lifecycle checks

| Check | Result | Notes |
| ----- | ------ | ----- |
| Fresh extension / doctor load | PASS | `node dist/cli.js doctor .` → Ready, version 0.1.1 |
| `/verity doctor` semantics | PASS | lifecycle test + CLI; repair status covered in adapter lifecycle |
| Golden Demo | PASS | weak UNPROVEN, strong PASS, then STALE |
| Read-only tool-call lifecycle | PASS | `test/adapter-pi.lifecycle.test.ts` |
| Mutating tool-call lifecycle | PASS | same file |
| Stale proof | PASS | Golden Demo + adapter tests |
| Passive repair default | PASS | unset env → no `triggerTurn` on FAIL |

## Default repair behavior

`PI_VERITY_MAX_REPAIR_ATTEMPTS` default `0`. Invalid/negative → `0`. Max clamp `10`.

## Evidence

- Provider independence: `BLOCKED` (single OmniRoute provider)
- Performance: recorded single-machine smoke run, 0 LLM calls/tokens
- README truth audit: `docs/evidence/readme-truth-audit.md`

## Out of scope / not done

- npm publish (not authorized)
- Mutating immutable tag `v0.1.0`
- Two-provider live independence run
