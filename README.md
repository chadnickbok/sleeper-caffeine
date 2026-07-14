# Sleeper MCP

A local, read-only Model Context Protocol server for Sleeper fantasy football. It joins Sleeper player IDs to compact player profiles, caches the large NFL player directory, and exposes league-aware tools for roster, waiver-pool, matchup, trade, and history context.

## Safety and data scope

- Sleeper's public API is read-only and requires no token.
- This server never accepts a Sleeper password, email credential, wallet secret, or browser cookie.
- It cannot change a lineup, submit a waiver, or accept a trade.
- “Available” means absent from every current league roster. It does not prove waiver clearance, lock status, or lineup eligibility.
- Sleeper does not provide all current news, weather, independent projections, or optimal-lineup recommendations. Combine tool results with current external sources when making decisions.

## Requirements

- Node.js 20 or newer
- npm

## Install and build

```bash
npm install
npm run build
```

Run the MCP server over local stdio:

```bash
npm start
```

The process writes MCP protocol messages to stdout. Startup failures and maintenance messages go to stderr.

## Add to an MCP client

Use the absolute path to the built entry point in your client's local MCP configuration:

```json
{
  "mcpServers": {
    "sleeper": {
      "command": "node",
      "args": ["/absolute/path/to/sleeper-mcp/dist/src/index.js"]
    }
  }
}
```

For Codex CLI, the equivalent command is:

```bash
codex mcp add sleeper -- node /absolute/path/to/sleeper-mcp/dist/src/index.js
```

Restart or refresh the client after changing its MCP configuration.

## Tools

| Tool | Purpose |
| --- | --- |
| `get_team_snapshot` | League settings, joined roster, selected week's matchup, and traded-pick context for one manager. |
| `get_available_players` | Players absent from all current rosters, with position/search filters and optional Sleeper trending-add ranking. |
| `get_matchup_context` | Both sides of a weekly matchup, including ordered starters, bench, reserve, taxi, points, scoring, and roster slots. |
| `get_trade_context` | Every roster, traded-picks ledger, drafts, and optionally selected weeks of transaction history. |
| `get_league_history` | Up to ten linked seasons using Sleeper's `previous_league_id` chain. |

All IDs are strings except Sleeper roster IDs, which are numbers. Pass a username or stable user ID through `username_or_user_id`.

Example tool input:

```json
{
  "league_id": "123456789012345678",
  "username_or_user_id": "your_sleeper_username",
  "week": 3
}
```

## Player cache

Sleeper asks clients to fetch `/players/nfl` no more than daily. The server stores the validated response at `.cache/sleeper/players-nfl.json`, indexes it in memory, and shares one refresh across concurrent callers.

If a refresh fails and a valid older cache exists, tools return the stale cache with a `STALE_PLAYER_CACHE` warning and timestamp. If no valid cache exists, the tool fails clearly.

Refresh explicitly:

```bash
npm run cache:refresh
```

Override the cache directory:

```bash
SLEEPER_CACHE_DIR=/path/to/cache npm start
```

## Development

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Inspect the built server interactively:

```bash
npm run build
npm run inspect
```

Live tests are opt-in and execute only documented GET endpoints:

```bash
SLEEPER_LIVE_LEAGUE_ID=123456789012345678 \
SLEEPER_LIVE_USER=your_username \
npm run test:live
```

Fixture tests do not use a real Sleeper account and do not require network access.

## Result freshness and errors

Successful structured results include:

- `as_of`: when the MCP result was assembled.
- `source`: always `sleeper` in v0.1.
- `cache.players_fetched_at`: age of joined player metadata.
- `cache.players_stale`: whether a failed refresh caused stale fallback.
- `warnings`: partial-data and semantic caveats.
- `data`: compact tool-specific content.

Stable error codes include `INVALID_INPUT`, `SLEEPER_NOT_FOUND`, `SLEEPER_RATE_LIMITED`, `SLEEPER_UNAVAILABLE`, `INVALID_SLEEPER_RESPONSE`, `PLAYER_CACHE_UNAVAILABLE`, and `TEAM_NOT_FOUND`.

## Architecture and roadmap

See [PLAN.md](./PLAN.md) for the architecture, endpoint map, implementation phases, security constraints, future Streamable HTTP transport, and the separate design review required before any browser-based write automation.

## Sources

- [Sleeper API documentation](https://docs.sleeper.com/)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [OpenAI Apps SDK MCP server guide](https://developers.openai.com/apps-sdk/build/mcp-server)
