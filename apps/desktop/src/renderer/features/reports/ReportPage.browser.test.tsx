import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { CodexStatus } from "@sleeper-caffeine/ipc-contract";
import { reportFixture } from "../../test/fixtures.js";
import { ReportPage } from "./ReportPage.js";
import "../../test/browser-styles.js";

const ready: CodexStatus = {
  state: "ready",
  binaryPath: "/usr/local/bin/codex",
  version: "test",
  email: "analyst@example.com",
  planType: "test",
  errorMessage: null,
  availableModels: [],
};

test("generates an empty report only after an explicit action", async () => {
  const onGenerate = vi.fn();
  await render(
    <ReportPage
      kind="team_analysis"
      eyebrow="Full roster audit"
      title="Team analysis"
      description="Test report"
      report={null}
      generating={null}
      codex={ready}
      onGenerate={onGenerate}
      onLogin={vi.fn()}
    />,
  );

  await expect
    .element(page.getByText("No AI turn has been spent yet."))
    .toBeVisible();
  expect(onGenerate).not.toHaveBeenCalled();
  await page.getByRole("button", { name: "Generate report" }).click();
  expect(onGenerate).toHaveBeenCalledWith("team_analysis");
});

test("shows distinct generation and stale-report states", async () => {
  const view = await render(
    <ReportPage
      kind="team_analysis"
      eyebrow="Full roster audit"
      title="Team analysis"
      description="Test report"
      report={null}
      generating="team_analysis"
      codex={ready}
      onGenerate={vi.fn()}
      onLogin={vi.fn()}
    />,
  );

  await expect.element(page.getByText("Researching your league")).toBeVisible();

  await view.rerender(
    <ReportPage
      kind="team_analysis"
      eyebrow="Full roster audit"
      title="Team analysis"
      description="Test report"
      report={reportFixture({ invalidated: true })}
      generating={null}
      codex={ready}
      onGenerate={vi.fn()}
      onLogin={vi.fn()}
    />,
  );
  await expect.element(page.getByText("Sleeper data changed")).toBeVisible();
  await expect
    .element(page.getByText("A strong core with one obvious pressure point"))
    .toBeVisible();
});
