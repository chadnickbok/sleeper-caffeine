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

beforeEach(() => {
  queryClient.clear();
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
