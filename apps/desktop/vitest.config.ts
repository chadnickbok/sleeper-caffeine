import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ["react/jsx-dev-runtime"] },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["**/*.browser.test.{ts,tsx}"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/renderer/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
