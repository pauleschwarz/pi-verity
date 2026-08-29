# Contributing

Thank you for improving `pi-verity`.

## Development setup

Requirements:

- Node.js 20 or newer
- npm
- Git
- Pi only when changing or smoke-testing the Pi adapter

```bash
npm ci
npm run verify
npm run build
npm pack --dry-run
```

Unit and integration groups can be run separately:

```bash
npm run test:unit
npm run test:integration
```

## Design constraints

- Keep `src/core/` independent of Pi, TUI, LLM, model, and provider APIs.
- Do not add another agent, daemon, service, or hidden network dependency.
- Prefer deterministic evidence and pure verdict/hash/policy functions.
- Keep commands, output, temporary storage, and evidence bounded.
- Never degrade inconclusive evidence to `PASS`.
- Never claim a change was unnecessary without proof.
- Keep successful automatic Pi UX quiet.
- Preserve the original worktree; execution belongs in disposable copies.

## Tests

Changes should include positive, negative, unavailable-evidence, and relevant security fixtures. Pi adapter changes need helper/unit coverage and a real Pi smoke test before release.

Before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm pack --dry-run
npm audit
```

## Documentation

Document only shipped behavior. There is no `.pi-verity.yml` parser today. Any receipt schema change must bump `schema_version`, update the JSON Schema, fixtures, changelog, and release notes.

## Pull requests

Use a focused title and explain:

- behavior changed
- deterministic evidence added
- security implications
- tests run
- remaining limitations

Security reports should follow the
[Security Policy](https://github.com/pauleschwarz/pi-verity/security/policy), not a
public issue.
