import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CodexStatus } from "@sleeper-caffeine/ipc-contract";
import { reportFixture } from "../../test/fixtures.js";
import { ReportPage } from "./ReportPage.js";

const ready: CodexStatus = {
  state: "ready",
  binaryPath: "/usr/local/bin/codex",
  version: "test",
  email: "analyst@example.com",
  planType: "test",
  errorMessage: null,
  availableModels: [],
};

const meta: Meta<typeof ReportPage> = {
  title: "Caffeine/Reports/Team Analysis",
  component: ReportPage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: "min(960px, 92vw)", margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    kind: "team_analysis",
    eyebrow: "Full roster audit",
    title: "Team analysis",
    description: "A candid, league-aware audit backed by current Sleeper data.",
    generating: null,
    report: null,
    codex: ready,
    onGenerate: () => undefined,
    onLogin: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Generating: Story = {
  args: { generating: "team_analysis" },
};

export const Complete: Story = {
  args: { report: reportFixture() },
};

export const Stale: Story = {
  args: { report: reportFixture({ invalidated: true }) },
};

export const SignedOut: Story = {
  args: {
    codex: {
      ...ready,
      state: "signed_out",
      email: null,
      planType: null,
    },
  },
};
