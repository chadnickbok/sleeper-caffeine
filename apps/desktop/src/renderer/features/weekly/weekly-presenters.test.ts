import { describe, expect, it } from "vitest";
import {
  dashboardFixture,
  weeklyBriefsFixture,
  weeklyPlanFixture,
} from "../../test/fixtures.js";
import {
  actionOutputFor,
  actionStatusPresentation,
  completedActions,
  fiveDecisions,
  formatFaabRange,
  unresolvedActions,
  weeklyPageMode,
  weeklyPhaseSteps,
} from "./weekly-presenters.js";

describe("weeklyPageMode", () => {
  it("keeps every unsupported league lifecycle in the draft-and-research state", () => {
    const bundle = weeklyPlanFixture();
    for (const leagueStatus of ["pre_draft", "drafting", "paused"])
      expect(
        weeklyPageMode({
          leagueStatus,
          leagueWeek: bundle.leagueWeek,
          plan: bundle.plan,
          running: false,
          failed: false,
        }),
      ).toBe("unsupported");
  });

  it("distinguishes refresh, build, changed, stale, and retained-building states", () => {
    const dashboard = dashboardFixture();
    const bundle = weeklyPlanFixture();
    expect(
      weeklyPageMode({
        leagueStatus: dashboard.leagueStatus,
        leagueWeek: null,
        plan: null,
        running: false,
        failed: false,
      }),
    ).toBe("needs_refresh");
    expect(
      weeklyPageMode({
        leagueStatus: dashboard.leagueStatus,
        leagueWeek: { ...bundle.leagueWeek, planStatus: "not_built" },
        plan: null,
        running: false,
        failed: false,
      }),
    ).toBe("ready");
    expect(
      weeklyPageMode({
        leagueStatus: dashboard.leagueStatus,
        leagueWeek: { ...bundle.leagueWeek, planStatus: "data_changed" },
        plan: bundle.plan,
        running: false,
        failed: false,
      }),
    ).toBe("changed");
    expect(
      weeklyPageMode({
        leagueStatus: dashboard.leagueStatus,
        leagueWeek: { ...bundle.leagueWeek, planStatus: "research_stale" },
        plan: bundle.plan,
        running: false,
        failed: false,
      }),
    ).toBe("stale");
    expect(
      weeklyPageMode({
        leagueStatus: dashboard.leagueStatus,
        leagueWeek: bundle.leagueWeek,
        plan: bundle.plan,
        running: true,
        failed: false,
      }),
    ).toBe("building");
  });
});

describe("weekly presenters", () => {
  it("marks earlier weekly phases complete and keeps future phases upcoming", () => {
    expect(weeklyPhaseSteps("thursday").map(({ state }) => state)).toEqual([
      "complete",
      "complete",
      "current",
      "upcoming",
    ]);
    expect(
      weeklyPhaseSteps("weekend", new Set()).map(({ state }) => state),
    ).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
    expect(
      weeklyPhaseSteps("weekend", new Set(["tuesday", "wednesday"])).map(
        ({ state }) => state,
      ),
    ).toEqual(["complete", "complete", "current", "upcoming"]);
  });

  it("presents all five decisions without pretending Tuesday built a lineup", () => {
    const plan = weeklyPlanFixture().plan;
    if (!plan) throw new Error("Fixture plan missing");
    const decisions = fiveDecisions(plan);
    expect(decisions.map(({ id }) => id)).toEqual([
      "lineup",
      "waivers",
      "upgrades",
      "lane",
      "market",
    ]);
    expect(decisions[0]).toMatchObject({
      value: "Thursday pass",
      detail: "Not built in the Tuesday plan",
    });
    expect(decisions[1]?.value).toBe("2 ranked claims");
  });

  it("updates the lineup decision after the Thursday pass is built", () => {
    const bundle = weeklyPlanFixture();
    const thursday = weeklyBriefsFixture().thursday;
    if (!bundle.plan || thursday?.phase !== "thursday")
      throw new Error("Thursday fixture missing");
    const lineupAction = {
      ...bundle.actions[0]!,
      actionKey: "thursday:start-rookie-flex",
      kind: "lineup_move" as const,
    };
    expect(
      fiveDecisions(bundle.plan, thursday, [lineupAction])[0],
    ).toMatchObject({
      value: "1 open call",
      detail: thursday.output.headline,
      tone: "accent",
    });
  });

  it("formats FAAB and maps persisted actions back to their researched output", () => {
    const bundle = weeklyPlanFixture();
    if (!bundle.plan) throw new Error("Fixture plan missing");
    expect(formatFaabRange(bundle.plan.output.waiverClaims[0]!)).toBe(
      "8%–12% FAAB",
    );
    expect(
      actionOutputFor(bundle.plan, bundle.actions[0]!)?.keyUncertainty,
    ).toContain("practice participation");
    expect(actionStatusPresentation("observed_in_sleeper")).toEqual({
      label: "Seen in Sleeper",
      tone: "info",
    });
    const observed = {
      ...bundle.actions[0]!,
      status: "observed_in_sleeper" as const,
    };
    expect(unresolvedActions([observed])).toHaveLength(1);
    expect(completedActions([observed])).toHaveLength(0);
  });
});
