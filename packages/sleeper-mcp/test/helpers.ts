import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PlayerCache,
  PlayerDirectory,
  SleeperApi,
  SleeperClient,
  type DomainDependencies,
  type FetchLike,
} from "@sleeper-caffeine/core";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/sleeper",
);

export async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(FIXTURE_DIR, name), "utf8")) as unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function createFixtureFetch(
  overrides: Record<string, unknown> = {},
): Promise<FetchLike> {
  const routes: Record<string, unknown> = {
    "/v1/state/nfl": await fixture("state.json"),
    "/v1/user/manager_one": await fixture("user.json"),
    "/v1/user/u1": await fixture("user.json"),
    "/v1/league/12345": await fixture("league.json"),
    "/v1/league/12345/users": await fixture("users.json"),
    "/v1/league/12345/rosters": await fixture("rosters.json"),
    "/v1/league/12345/matchups/3": await fixture("matchups.json"),
    "/v1/league/12345/traded_picks": await fixture("traded-picks.json"),
    "/v1/league/12345/drafts": await fixture("drafts.json"),
    "/v1/league/12345/transactions/3": await fixture("transactions.json"),
    "/v1/league/12345/winners_bracket": await fixture("bracket.json"),
    "/v1/players/nfl": await fixture("players.json"),
    "/v1/players/nfl/trending/add": await fixture("trending.json"),
    ...overrides,
  };

  return async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!(url.pathname in routes)) {
      return jsonResponse({ error: `No fixture for ${url.pathname}` }, 404);
    }
    return jsonResponse(routes[url.pathname]);
  };
}

export async function createFixtureDependencies(): Promise<DomainDependencies> {
  const fetch = await createFixtureFetch();
  const api = new SleeperApi(new SleeperClient({ fetch, maxRetries: 0 }));
  const cacheDir = await mkdtemp(join(tmpdir(), "sleeper-mcp-test-"));
  return {
    api,
    players: new PlayerDirectory(new PlayerCache(api, { cacheDir })),
  };
}
