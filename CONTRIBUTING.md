# Contributing to Sleeper Caffeine

Thanks for helping build a sharper, safer fantasy football front office.

## Setup

```bash
pnpm install
pnpm build:packages
pnpm dev
```

Before opening a pull request:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Architecture rules

- Put Sleeper HTTP, validation, caching, joins, and fantasy-domain behavior in `packages/sleeper-core`.
- Keep MCP-specific behavior in `packages/sleeper-mcp`.
- Keep child processes, SQLite, secrets, and filesystem access out of the renderer.
- Add renderer/main methods to the typed IPC contract before implementing either side.
- Treat AI output as untrusted: constrain it, parse it, and validate it before persistence.
- A Sleeper refresh must never invoke Codex implicitly.
- Do not add Sleeper write behavior or signed-in browser automation without an accepted design proposal.

## Tests

Fixture tests are the default. Live tests are opt-in and must use documented read-only endpoints.

When changing an MCP tool, cover both domain behavior and the MCP contract. When changing the desktop runtime, add a test for the deterministic behavior beneath the UI where practical.

## Pull requests

Keep changes focused and include:

- The user-facing behavior.
- Important architecture or safety tradeoffs.
- Commands used to verify the change.
- Screenshots for visible UI changes.
- Any migration or compatibility impact.

Use conventional, imperative commit subjects when possible, for example `feat: add draft board refresh`.
