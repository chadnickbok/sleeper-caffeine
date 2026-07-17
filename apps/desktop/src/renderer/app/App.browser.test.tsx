import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { LeaguePreview } from "@sleeper-caffeine/ipc-contract";
import { App } from "../App.js";
import {
  createMockCaffeineApi,
  emptyBootstrap,
} from "../test/mock-caffeine-api.js";
import { AppProviders } from "./AppProviders.js";
import { queryClient } from "./query-client.js";
import { bootstrapFixture } from "../test/fixtures.js";
import "../test/browser-styles.js";

const preview: LeaguePreview = {
  leagueId: "289646328504385536",
  name: "Sleeper Test League",
  season: "2026",
  status: "pre_draft",
  totalRosters: 2,
  teams: [
    {
      rosterId: 1,
      userId: "test-user",
      username: "caffeine_test",
      displayName: "Caffeine Test",
      teamName: "The Test Roasters",
      avatar: null,
      record: "0-0",
    },
    {
      rosterId: 2,
      userId: "other-user",
      username: "other",
      displayName: "Other Manager",
      teamName: "Decaf Dynasty",
      avatar: null,
      record: "0-0",
    },
  ],
};

beforeEach(async () => {
  queryClient.clear();
  await page.viewport(1440, 930);
});

test("keeps the full application usable at the minimum window size", async () => {
  await page.viewport(1050, 720);
  const bootstrap = bootstrapFixture("win32");
  const refreshActiveLeague = vi.fn(() => Promise.resolve(bootstrap));
  const generateReport = vi.fn(() => Promise.reject(new Error("unused")));
  Object.defineProperty(window, "sleeperCaffeine", {
    configurable: true,
    value: createMockCaffeineApi({
      bootstrap: () => Promise.resolve(bootstrap),
      refreshActiveLeague,
      generateReport,
    }),
  });

  await render(
    <AppProviders>
      <App />
    </AppProviders>,
  );

  await expect
    .element(page.getByText("The Test Roasters").first())
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Ask analyst Ctrl K" }))
    .toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth,
  );

  await page.getByRole("button", { name: "Refresh Sleeper" }).click();
  expect(refreshActiveLeague).toHaveBeenCalledOnce();
  expect(generateReport).not.toHaveBeenCalled();

  await page.getByRole("button", { name: "Roster" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Roster room" }))
    .toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    window.innerWidth,
  );

  const pageScroll = page.getByTestId("page-scroll").element();
  pageScroll.scrollTop = 480;
  await page.getByRole("button", { name: "Settings" }).click();
  await expect
    .element(page.getByRole("heading", { name: "Settings" }))
    .toBeVisible();
  expect(pageScroll.scrollTop).toBe(0);
});

test("opens and closes the analyst drawer through visible controls", async () => {
  const bootstrap = bootstrapFixture();
  Object.defineProperty(window, "sleeperCaffeine", {
    configurable: true,
    value: createMockCaffeineApi({
      bootstrap: () => Promise.resolve(bootstrap),
    }),
  });

  await render(
    <AppProviders>
      <App />
    </AppProviders>,
  );

  await page.getByRole("button", { name: /Ask analyst/ }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Caffeine Analyst" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Close analyst" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Caffeine Analyst" }))
    .not.toBeInTheDocument();
});

test("completes the mocked league onboarding path", async () => {
  const previewLeague = vi.fn(() => Promise.resolve(preview));
  const saveLeague = vi.fn(() => Promise.resolve(emptyBootstrap));
  Object.defineProperty(window, "sleeperCaffeine", {
    configurable: true,
    value: createMockCaffeineApi({ previewLeague, saveLeague }),
  });

  await render(
    <AppProviders>
      <App />
    </AppProviders>,
  );

  const input = page.getByRole("textbox", { name: "League URL" });
  await input.fill("https://sleeper.com/leagues/289646328504385536");
  await page.getByRole("button", { name: "Find league" }).click();

  await expect.element(page.getByText("Which team is yours?")).toBeVisible();
  await page.getByRole("button", { name: /The Test Roasters/ }).click();
  await page.getByRole("button", { name: "Open front office" }).click();

  expect(previewLeague).toHaveBeenCalledWith(
    "https://sleeper.com/leagues/289646328504385536",
  );
  expect(saveLeague).toHaveBeenCalledWith({
    leagueId: preview.leagueId,
    rosterId: 1,
    userId: "test-user",
  });
});
