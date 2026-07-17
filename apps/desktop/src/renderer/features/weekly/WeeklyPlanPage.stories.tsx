import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  bootstrapFixture,
  dashboardFixture,
  weeklyBriefsFixture,
  weeklyPlanFixture,
} from "../../test/fixtures.js";
import { WeeklyPlanPage } from "./WeeklyPlanPage.js";

const bundle = weeklyPlanFixture();
const bootstrap = bootstrapFixture();

const meta: Meta<typeof WeeklyPlanPage> = {
  title: "Caffeine/Weekly/Command Center",
  component: WeeklyPlanPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div
        style={{ width: "min(1180px, calc(100vw - 32px))", margin: "0 auto" }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    dashboard: dashboardFixture(),
    leagueWeek: bundle.leagueWeek,
    plan: bundle.plan,
    actions: bundle.actions,
    briefs: { wednesday: null, thursday: null, weekend: null },
    codex: bootstrap.codex,
    generation: null,
    phaseGeneration: null,
    error: null,
    refreshing: false,
    pendingActionId: null,
    onRefresh: () => undefined,
    onGenerate: () => undefined,
    onLogin: () => undefined,
    onUpdateAction: () => undefined,
    onGeneratePhase: () => undefined,
    onOpenDraft: () => undefined,
    onOpenTeamAnalysis: () => undefined,
    onOpenTradeLab: () => undefined,
    onOpenLineup: () => undefined,
    onOpenAnalyst: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentPlan: Story = {};

export const ReadyToRefresh: Story = {
  args: { leagueWeek: null, plan: null, actions: [] },
};

export const ReadyToBuild: Story = {
  args: {
    leagueWeek: {
      ...bundle.leagueWeek,
      currentPlanId: null,
      planStatus: "not_built",
    },
    plan: null,
    actions: [],
  },
};

export const BuildingFirstPlan: Story = {
  args: {
    leagueWeek: {
      ...bundle.leagueWeek,
      currentPlanId: null,
      planStatus: "building",
    },
    plan: null,
    actions: [],
    generation: { mode: "build", stage: "researching_candidates" },
  },
};

export const UpdatingWithPlanRetained: Story = {
  args: {
    generation: { mode: "refine", stage: "building_plan" },
  },
};

export const DataChanged: Story = {
  args: {
    leagueWeek: {
      ...bundle.leagueWeek,
      planStatus: "data_changed",
      meaningfulChanges: [
        {
          id: "weekly-change-1",
          kind: "waiver",
          headline: "Breakout Runner was claimed",
          description: "The primary waiver target is no longer available.",
          entityType: "player",
          entityId: "add-rb",
          occurredAt: "2026-07-17T13:00:00.000Z",
          detectedAt: "2026-07-17T13:01:00.000Z",
          material: true,
          sourceEventId: null,
        },
      ],
    },
  },
};

export const ResearchStale: Story = {
  args: {
    leagueWeek: { ...bundle.leagueWeek, planStatus: "research_stale" },
  },
};

export const SignedOutWithSavedPlan: Story = {
  args: {
    codex: {
      ...bootstrap.codex,
      state: "signed_out",
      email: null,
      planType: null,
    },
  },
};

export const FailedWithSavedPlan: Story = {
  args: {
    error: "Codex returned an incomplete contingency ladder.",
  },
};

export const PreseasonDraftHandoff: Story = {
  args: {
    dashboard: {
      ...dashboardFixture(),
      leagueStatus: "drafting",
    },
    leagueWeek: null,
    plan: null,
    actions: [],
  },
};

export const WednesdayAftermath: Story = {
  args: (() => {
    const actions = bundle.actions.map((action, index) =>
      index === 0
        ? { ...action, status: "observed_in_sleeper" as const }
        : index === 1
          ? { ...action, status: "completed" as const }
          : action,
    );
    return {
      leagueWeek: { ...bundle.leagueWeek, phase: "wednesday" as const },
      actions,
      briefs: { ...weeklyBriefsFixture(), thursday: null, weekend: null },
    };
  })(),
};

export const FullWeeklyCycle: Story = {
  args: (() => {
    const actions = [
      ...bundle.actions,
      {
        ...bundle.actions[0]!,
        id: "thursday-action-story",
        actionKey: "thursday:start-rookie-flex",
        kind: "lineup_move" as const,
        title: "Set the recommended FLEX",
      },
      {
        ...bundle.actions[0]!,
        id: "weekend-action-story",
        actionKey: "weekend:check-receiver-status",
        kind: "inactive_check" as const,
        title: "Confirm Receiver One is active",
      },
    ];
    return {
      leagueWeek: { ...bundle.leagueWeek, phase: "weekend" as const },
      briefs: weeklyBriefsFixture(),
      actions,
    };
  })(),
};

export const UpdatingThursdayBrief: Story = {
  args: {
    briefs: weeklyBriefsFixture(),
    phaseGeneration: {
      phase: "thursday",
      mode: "regenerate",
      stage: "researching_players",
    },
  },
};
