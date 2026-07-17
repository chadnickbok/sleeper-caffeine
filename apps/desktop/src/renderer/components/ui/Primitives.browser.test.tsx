import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import "../../test/browser-styles.js";
import { Button } from "./Button/Button.js";

test("shared buttons expose loading and disabled behavior", async () => {
  await render(
    <Button variant="primary" loading>
      Generate analysis
    </Button>,
  );

  const button = page.getByRole("button", { name: "Generate analysis" });
  await expect.element(button).toBeDisabled();
  await expect.element(button).toHaveAttribute("aria-busy", "true");
});
