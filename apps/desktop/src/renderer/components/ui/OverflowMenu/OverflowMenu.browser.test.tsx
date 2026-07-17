import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../../../test/browser-styles.js";
import { OverflowMenu, OverflowMenuItem } from "./OverflowMenu.js";

test("opens, runs an action, and closes the menu", async () => {
  const onSelect = vi.fn();
  await render(
    <OverflowMenu label="Plan actions">
      <OverflowMenuItem onSelect={onSelect}>Mark complete</OverflowMenuItem>
      <OverflowMenuItem>Dismiss</OverflowMenuItem>
    </OverflowMenu>,
  );

  await page.getByRole("button", { name: "Plan actions" }).click();
  const action = page.getByRole("menuitem", { name: "Mark complete" });
  await expect.element(action).toBeVisible();
  await action.click();

  expect(onSelect).toHaveBeenCalledOnce();
  await expect.element(action).not.toBeInTheDocument();
});

test("supports keyboard navigation and Escape", async () => {
  await render(
    <OverflowMenu label="Plan actions">
      <OverflowMenuItem>First action</OverflowMenuItem>
      <OverflowMenuItem>Second action</OverflowMenuItem>
    </OverflowMenu>,
  );

  const trigger = page.getByRole("button", { name: "Plan actions" });
  await trigger.click();
  await expect
    .element(page.getByRole("menuitem", { name: "First action" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(page.getByRole("menuitem", { name: "Second action" }))
    .toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();
});
