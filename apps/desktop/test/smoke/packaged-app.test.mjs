import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const releaseDir = join(desktopDir, "release");
const capturedAt = "2026-07-17T12:00:00.000Z";

let electronApplication;
let page;
let userDataDir;

before(async () => {
  userDataDir = await mkdtemp(join(tmpdir(), "sleeper-caffeine-smoke-"));
  seedDashboard(userDataDir);

  const executablePath = await findPackagedExecutable(releaseDir);
  electronApplication = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      SLEEPER_CAFFEINE_SMOKE_TEST: "1",
      SLEEPER_CAFFEINE_SMOKE_USER_DATA: userDataDir,
    },
  });
  page = await electronApplication.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("heading", { name: "The Test Roasters", exact: true })
    .waitFor();
});

after(async () => {
  await electronApplication?.close().catch(() => undefined);
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true });
});

test("launches the packaged application with isolated local state", async () => {
  assert.match(page.url(), /^file:/);
  assert.equal(await page.title(), "Sleeper Caffeine");

  const state = await electronApplication.evaluate(
    async ({ app, BrowserWindow }, expectedUserData) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error("Packaged app did not create a window");
      return {
        appPath: app.getAppPath(),
        isPackaged: app.isPackaged,
        minimumSize: window.getMinimumSize(),
        platform: process.platform,
        size: window.getSize(),
        windowButtonPosition:
          process.platform === "darwin"
            ? window.getWindowButtonPosition()
            : null,
        userData: app.getPath("userData"),
        visible: window.isVisible(),
        expectedUserData,
      };
    },
    userDataDir,
  );

  assert.equal(state.isPackaged, true);
  assert.match(state.appPath, /app\.asar$/);
  assert.equal(resolve(state.userData), resolve(state.expectedUserData));
  assert.deepEqual(state.minimumSize, [1050, 720]);
  assert.ok(state.size[0] >= state.minimumSize[0]);
  assert.ok(state.size[1] >= state.minimumSize[1]);
  assert.equal(state.visible, true);
  if (state.platform === "darwin")
    assert.deepEqual(state.windowButtonPosition, { x: 16, y: 18 });
  else assert.equal(state.windowButtonPosition, null);
});

test("connects the packaged renderer to the real preload IPC bridge", async () => {
  const result = await page.evaluate(async () => {
    const api = globalThis.sleeperCaffeine;
    return {
      bootstrap: await api.bootstrap(),
      methods: Object.entries(api)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name)
        .sort(),
    };
  });

  assert.ok(result.methods.includes("bootstrap"));
  assert.ok(result.methods.includes("refreshActiveLeague"));
  assert.ok(result.methods.includes("generateWeeklyPlan"));
  assert.ok(result.methods.includes("loadWeeklyPhaseBrief"));
  assert.ok(result.methods.includes("generateWeeklyPhaseBrief"));
  assert.ok(result.methods.includes("onRuntimeEvent"));
  assert.equal(result.bootstrap.leagues.length, 1);
  assert.equal(
    result.bootstrap.activeDashboard.league.leagueId,
    "smoke-league",
  );
  assert.equal(
    result.bootstrap.activeDashboard.league.teamName,
    "The Test Roasters",
  );
  assert.equal(result.bootstrap.platform, process.platform);
  assert.equal(result.bootstrap.mcp.state, "stopped");
  assert.equal(result.bootstrap.codex.state, "starting");
  assert.deepEqual(result.bootstrap.currentWeeklyBriefs, {
    wednesday: null,
    thursday: null,
    weekend: null,
  });

  const emptyBrief = await page.evaluate(() =>
    globalThis.sleeperCaffeine.loadWeeklyPhaseBrief({
      leagueId: "smoke-league",
      season: "2026",
      week: 1,
      phase: "wednesday",
    }),
  );
  assert.equal(emptyBrief, null);
});

test("migrates an existing packaged database through the weekly schema", () => {
  const database = new DatabaseSync(
    join(userDataDir, "sleeper-caffeine.sqlite"),
    { readOnly: true },
  );
  const version = database.prepare("PRAGMA user_version").get().user_version;
  const phaseTable = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'weekly_phase_briefs'",
    )
    .get();
  database.close();
  assert.equal(version, 3);
  assert.equal(phaseTable.name, "weekly_phase_briefs");
});

test("navigates between packaged feature surfaces", async () => {
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await page.getByRole("heading", { name: "Roster room" }).waitFor();

  await page.getByRole("button", { name: /Weekly plan/ }).click();
  await page
    .getByRole("heading", { name: "Run this week like a front office" })
    .waitFor();

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();

  await page.getByRole("button", { name: "Front office", exact: true }).click();
  await page
    .getByRole("heading", { name: "The Test Roasters", exact: true })
    .waitFor();
});

test("applies platform-aware packaged window chrome", async () => {
  const chrome = await page.evaluate(() => {
    const shell = document.querySelector('[data-testid="app-shell"]');
    const trafficSpace = document.querySelector(
      '[data-testid="traffic-space"]',
    );
    const topBar = document.querySelector(
      '[aria-label="Application title bar"]',
    );
    const navButton = document.querySelector(
      '[aria-label="Main navigation"] button',
    );
    if (!shell || !trafficSpace || !topBar || !navButton)
      throw new Error("Application chrome was not rendered");
    return {
      navRegion:
        getComputedStyle(navButton).getPropertyValue("-webkit-app-region"),
      platform: shell.getAttribute("data-platform"),
      topBarRegion:
        getComputedStyle(topBar).getPropertyValue("-webkit-app-region"),
      trafficHeight: Number.parseFloat(getComputedStyle(trafficSpace).height),
    };
  });

  assert.equal(chrome.platform, process.platform);
  assert.equal(chrome.navRegion, "no-drag");
  if (process.platform === "darwin") {
    assert.equal(chrome.topBarRegion, "drag");
    assert.equal(chrome.trafficHeight, 48);
  } else {
    assert.notEqual(chrome.topBarRegion, "drag");
    assert.equal(chrome.trafficHeight, 16);
  }
});

async function findPackagedExecutable(root) {
  const override = process.env["SLEEPER_CAFFEINE_PACKAGED_EXECUTABLE"];
  if (override) {
    await access(override, constants.X_OK);
    return resolve(override);
  }

  const files = await walk(root);
  const executable = files.find((path) => {
    if (process.platform === "darwin")
      return path.endsWith(
        join("Sleeper Caffeine.app", "Contents", "MacOS", "Sleeper Caffeine"),
      );
    if (process.platform === "win32")
      return (
        dirname(path).endsWith("win-unpacked") &&
        path.endsWith("Sleeper Caffeine.exe")
      );
    return (
      dirname(path).endsWith("linux-unpacked") &&
      path.endsWith("sleeper-caffeine")
    );
  });
  if (!executable)
    throw new Error(
      `No packaged ${process.platform} executable found below ${root}. Build with electron-builder --dir first.`,
    );
  return executable;
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return nested.flat();
}

function seedDashboard(directory) {
  const league = {
    leagueId: "smoke-league",
    name: "Packaged Smoke League",
    season: "2026",
    rosterId: 1,
    userId: "smoke-user",
    teamName: "The Test Roasters",
    avatar: null,
    lastRefreshedAt: capturedAt,
    isActive: true,
  };
  const player = (playerId, name, position, rosterSlot = position) => ({
    playerId,
    name,
    position,
    nflTeam: "TEST",
    injuryStatus: null,
    status: "Active",
    isStarter: true,
    isReserve: false,
    isTaxi: false,
    rosterSlot,
  });
  const dashboard = {
    league,
    capturedAt,
    week: 1,
    leagueStatus: "in_season",
    scoringLabel: "PPR",
    rosterPositions: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"],
    starters: [
      player("smoke-qb", "Quarterback One", "QB"),
      player("smoke-rb-1", "Running Back One", "RB"),
      player("smoke-rb-2", "Running Back Two", "RB"),
      player("smoke-wr-1", "Receiver One", "WR"),
      player("smoke-wr-2", "Receiver Two", "WR"),
      player("smoke-te", "Tight End One", "TE"),
      player("smoke-flex", "Flex Player One", "WR", "FLEX"),
    ],
    bench: [player("smoke-bench", "Bench Player", "WR")],
    reserve: [],
    taxi: [],
    record: { wins: 2, losses: 1, ties: 0, pointsFor: 412.6 },
    pickInventory: null,
    warnings: [],
    draft: null,
    nextMatchup: null,
  };

  const database = new DatabaseSync(join(directory, "sleeper-caffeine.sqlite"));
  database.exec(`
    CREATE TABLE leagues (
      league_id TEXT PRIMARY KEY, name TEXT NOT NULL, season TEXT NOT NULL,
      roster_id INTEGER NOT NULL, user_id TEXT NOT NULL, team_name TEXT NOT NULL,
      avatar TEXT, last_refreshed_at TEXT, snapshot_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 0
    );
  `);
  database
    .prepare(
      `INSERT INTO leagues (
        league_id, name, season, roster_id, user_id, team_name, avatar,
        last_refreshed_at, snapshot_json, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(
      league.leagueId,
      league.name,
      league.season,
      league.rosterId,
      league.userId,
      league.teamName,
      league.avatar,
      capturedAt,
      JSON.stringify(dashboard),
    );
  database.close();
}
