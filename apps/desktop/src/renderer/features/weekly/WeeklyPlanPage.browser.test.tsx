import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { WeeklyPlanPageProps } from "./WeeklyPlanPage.js";
import {
  bootstrapFixture,
  dashboardFixture,
  weeklyBriefsFixture,
  weeklyPlanFixture,
} from "../../test/fixtures.js";
import { WeeklyPlanPage } from "./WeeklyPlanPage.js";
import "../../test/browser-styles.js";

test("starts from fresh deterministic context and spends AI only after Build my plan", async () => {
  const onGenerate = vi.fn();
  const bundle = weeklyPlanFixture();
  await render(
    <WeeklyPlanPage
      {...baseProps()}
      leagueWeek={{
        ...bundle.leagueWeek,
        currentPlanId: null,
        planStatus: "not_built",
      }}
      plan={null}
      actions={[]}
      onGenerate={onGenerate}
    />,
  );

  await expect
    .element(page.getByText("Make the first call of the week."))
    .toBeVisible();
  await expect
    .element(page.getByText("No AI turn has been spent yet."))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: /Tuesday Build the plan/ }))
    .toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Build my plan" }).first().click();
  expect(onGenerate).toHaveBeenCalledWith("build");
});

test("renders the complete plan, evidence, claims, alternatives, and action dispositions", async () => {
  const onUpdateAction = vi.fn();
  const bundle = weeklyPlanFixture();
  if (!bundle.plan) throw new Error("Fixture plan missing");
  await render(
    <WeeklyPlanPage
      {...baseProps()}
      leagueWeek={bundle.leagueWeek}
      plan={bundle.plan}
      actions={bundle.actions}
      onUpdateAction={onUpdateAction}
    />,
  );

  await expect
    .element(page.getByRole("heading", { name: bundle.plan.output.headline }))
    .toBeVisible();
  await expect.element(page.getByText("2 ranked claims")).toBeVisible();
  await expect.element(page.getByText("Breakout Runner").first()).toBeVisible();
  await expect
    .element(page.getByText("Preserve receiver optionality instead"))
    .toBeVisible();
  await expect
    .element(page.getByText("Every roster spot needs a job"))
    .toBeVisible();
  await expect
    .element(
      page.getByText("No fake inactive sweep is shown here.", { exact: false }),
    )
    .toBeVisible();

  await page.getByRole("button", { name: "Mark done" }).first().click();
  expect(onUpdateAction).toHaveBeenCalledWith("weekly-action-1", "completed");

  await page
    .getByRole("button", {
      name: "More options for Ask the North Stars about receiver depth",
    })
    .click();
  await page.getByRole("menuitem", { name: "Trade was declined" }).click();
  expect(onUpdateAction).toHaveBeenCalledWith("weekly-action-3", "declined");
});

test("keeps the last successful plan visible while refining and after a failure", async () => {
  const bundle = weeklyPlanFixture({ planStatus: "data_changed" });
  if (!bundle.plan) throw new Error("Fixture plan missing");
  const props = baseProps();
  const view = await render(
    <WeeklyPlanPage
      {...props}
      leagueWeek={{
        ...bundle.leagueWeek,
        meaningfulChanges: [
          {
            id: "change-1",
            kind: "waiver",
            headline: "A recommended player changed teams",
            description:
              "The original plan remains readable until you refine it.",
            entityType: "player",
            entityId: "add-rb",
            occurredAt: "2026-07-17T13:00:00.000Z",
            detectedAt: "2026-07-17T13:01:00.000Z",
            material: true,
            sourceEventId: null,
          },
        ],
      }}
      plan={bundle.plan}
      actions={bundle.actions}
      generation={{ mode: "refine", stage: "researching_candidates" }}
    />,
  );

  await expect.element(page.getByText("Refining the plan")).toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: bundle.plan.output.headline }))
    .toBeVisible();

  await view.rerender(
    <WeeklyPlanPage
      {...props}
      leagueWeek={bundle.leagueWeek}
      plan={bundle.plan}
      actions={bundle.actions}
      error="The researched response did not match the weekly schema."
    />,
  );
  await expect.element(page.getByText("The latest run failed")).toBeVisible();
  await expect
    .element(
      page.getByText("Your last successful plan is still here.", {
        exact: false,
      }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: bundle.plan.output.headline }))
    .toBeVisible();
});

test("fits a narrow desktop content column without horizontal core overflow", async () => {
  const bundle = weeklyPlanFixture();
  if (!bundle.plan) throw new Error("Fixture plan missing");
  await render(
    <div style={{ width: 760 }}>
      <WeeklyPlanPage
        {...baseProps()}
        leagueWeek={bundle.leagueWeek}
        plan={bundle.plan}
        actions={bundle.actions}
      />
    </div>,
  );

  const root = document.querySelector<HTMLElement>(
    "[data-testid='weekly-plan-page']",
  );
  expect(root).not.toBeNull();
  expect(root!.scrollWidth).toBeLessThanOrEqual(root!.clientWidth + 1);
});

test("renders generated Wednesday, Thursday, and weekend briefs with trackable phase actions", async () => {
  const bundle = weeklyPlanFixture();
  const briefs = weeklyBriefsFixture();
  if (!bundle.plan) throw new Error("Fixture plan missing");
  const onUpdateAction = vi.fn();
  const thursdayAction = {
    ...bundle.actions[0]!,
    id: "thursday-action-1",
    actionKey: "thursday:start-rookie-flex",
    kind: "lineup_move" as const,
    title: "Set the recommended FLEX",
  };
  const weekendAction = {
    ...bundle.actions[0]!,
    id: "weekend-action-1",
    actionKey: "weekend:check-receiver-status",
    kind: "inactive_check" as const,
    title: "Confirm Receiver One is active",
  };
  await render(
    <WeeklyPlanPage
      {...baseProps()}
      leagueWeek={{ ...bundle.leagueWeek, phase: "weekend" }}
      plan={bundle.plan}
      actions={[...bundle.actions, thursdayAction, weekendAction]}
      briefs={briefs}
      onUpdateAction={onUpdateAction}
    />,
  );

  await expect
    .element(
      page.getByText(
        "Your first claim landed; one useful receiver also hit the wire",
      ),
    )
    .toBeVisible();
  await expect.element(page.getByText("Proposed legal lineup")).toBeVisible();
  await expect.element(page.getByText("1 open call")).toBeVisible();
  await expect
    .element(page.getByText("Receiver One needs a final active check"))
    .toBeVisible();
  await expect.element(page.getByText("Asymmetric stashes")).toBeVisible();
  await page.getByRole("button", { name: "Mark done" }).nth(3).click();
  expect(onUpdateAction).toHaveBeenCalledWith("thursday-action-1", "completed");
});

test("runs deterministic Wednesday while ChatGPT is signed out", async () => {
  const bundle = weeklyPlanFixture();
  if (!bundle.plan) throw new Error("Fixture plan missing");
  const onGeneratePhase = vi.fn();
  const onLogin = vi.fn();
  const codex = {
    ...baseProps().codex,
    state: "signed_out" as const,
    email: null,
    planType: null,
  };
  await render(
    <WeeklyPlanPage
      {...baseProps()}
      leagueWeek={{ ...bundle.leagueWeek, phase: "wednesday" }}
      plan={bundle.plan}
      actions={bundle.actions}
      codex={codex}
      onGeneratePhase={onGeneratePhase}
      onLogin={onLogin}
    />,
  );

  await page.getByRole("button", { name: "Review aftermath" }).click();
  expect(onGeneratePhase).toHaveBeenCalledWith("wednesday", "build");
  expect(onLogin).not.toHaveBeenCalled();
});

test("keeps a failed Thursday regeneration inside Thursday and retries that phase", async () => {
  const bundle = weeklyPlanFixture();
  const briefs = weeklyBriefsFixture();
  if (!bundle.plan) throw new Error("Fixture plan missing");
  const onGeneratePhase = vi.fn();
  await render(
    <WeeklyPlanPage
      {...baseProps()}
      leagueWeek={{ ...bundle.leagueWeek, phase: "thursday" }}
      plan={bundle.plan}
      actions={bundle.actions}
      briefs={{ ...briefs, weekend: null }}
      phaseErrors={{
        thursday: "The league changed while this pass was being built.",
      }}
      onGeneratePhase={onGeneratePhase}
    />,
  );

  await expect
    .element(page.getByText("The lineup pass was not updated"))
    .toBeVisible();
  await expect
    .element(
      page.getByText("The last valid version remains below.", { exact: false }),
    )
    .toBeVisible();
  expect(document.body.textContent).not.toContain("The latest run failed");
  await page.getByRole("button", { name: "Try again" }).click();
  expect(onGeneratePhase).toHaveBeenCalledWith("thursday", "regenerate");
});

function baseProps(): WeeklyPlanPageProps {
  const data = bootstrapFixture();
  return {
    dashboard: dashboardFixture(),
    leagueWeek: null,
    plan: null,
    actions: [],
    briefs: { wednesday: null, thursday: null, weekend: null },
    codex: data.codex,
    generation: null,
    phaseGeneration: null,
    error: null,
    refreshing: false,
    pendingActionId: null,
    onRefresh: vi.fn(),
    onGenerate: vi.fn(),
    onLogin: vi.fn(),
    onUpdateAction: vi.fn(),
    onGeneratePhase: vi.fn(),
    onOpenDraft: vi.fn(),
    onOpenTeamAnalysis: vi.fn(),
    onOpenTradeLab: vi.fn(),
    onOpenLineup: vi.fn(),
    onOpenAnalyst: vi.fn(),
  };
}
