# Harness integration

Verity's portable contract is a subprocess plus a state-bound JSON receipt. A
host does not need a Verity-specific SDK.

## Minimal loop

```text
1. Capture the user's task and repository path.
2. Let the coding agent work.
3. Run: verity verify <repository> --output <receipt.json>
4. Read the process exit code and receipt verdict.
5. Do not report success unless the verdict is PASS or PASS_WITH_WARNINGS.
```

```bash
verity doctor /path/to/repository
verity verify /path/to/repository --output .verity/receipt.json
```

| Exit | Meaning | Harness action |
| --- | --- | --- |
| `0` | `PASS` or `PASS_WITH_WARNINGS` | May report completion; surface warnings |
| `1` | `FAIL` | Surface the evidenced failure; do not claim done |
| `2` | `UNPROVEN`, invalid invocation, or blocked environment | Explain what evidence is missing; do not claim done |

When `--output` is omitted, canonical receipt JSON is written to stdout. The
single verdict line is written to stderr so a harness can keep structured and
human output separate.

## Core API

For an in-process Node/TypeScript integration:

```ts
import { verifyRepository, type VerifyOptions } from "@pauleschwarz/pi-verity";

const options: VerifyOptions = {
  cwd: "/path/to/repository",
  taskId: "task-123",
  sessionId: "session-456",
};
const receipt = await verifyRepository(options);
```

`verifyRepository` is harness-neutral. Exact counterfactual proof additionally
requires a `counterfactualBaseline` captured before the change. A host that did
not capture that workspace must leave it absent; Verity then records
`BASELINE_UNAVAILABLE` rather than reconstructing a fake baseline.

## Pi adapter

Pi supplies lifecycle hooks, a footer, commands, and optional pre-tool approval:

```ts
import piAdapter from "@pauleschwarz/pi-verity/adapters/pi";
```

Legacy import (kept working):

```ts
import piAdapter from "@pauleschwarz/pi-verity/adapter-pi";
```

The package's `pi.extensions` metadata auto-loads this adapter for Pi installs.
Other harnesses should use the CLI/core unless they implement their own adapter.

## Adapter requirements

An automatic host adapter should:

1. capture an exact workspace before the first repository mutation
2. classify host tools conservatively; unknown tools count as potentially mutating
3. run verification only after the agent turn settles
4. preserve cancellation and bounded execution
5. bind the receipt to the final repository state
6. keep `FAIL` and `UNPROVEN` visible to the user

Execution approval is optional and **not** portable by assumption. Only claim
it when the host exposes a trustworthy hook before tool execution.

## Browser evidence

visual-qa stays optional and standalone. Verity never launches a browser and
has no Playwright dependency. Pass a completed `report.json`:

```bash
visual-qa run --url http://127.0.0.1:3000 --out .qa
verity verify . --output .verity/receipt.json --visual-qa-report .qa/report.json
```

Fail-closed mapping:

| visual-qa result | Verity effect |
| --- | --- |
| `FAIL` | receipt `FAIL` |
| missing binary/report, malformed JSON, timeout, incomplete coverage | `UNPROVEN` |
| `PASS` without `--visual-qa-subject-bound` | recorded, verdict at most `PASS_WITH_WARNINGS` |
| `PASS` with `--visual-qa-subject-bound` | recorded as bound evidence; still cannot invent repository proof |

`--visual-qa-subject-bound` is a caller assertion that the browser subject was
the candidate under verification. Do not set it for a deployed, cached, or
otherwise unbound app. Browser artifacts stay in the visual-qa output
directory; the receipt stores only a bounded summary plus `report_hash`.

See the [migration plan](plans/2026-09-03-verity-harness-neutral.md).
