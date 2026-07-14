import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const developmentCspPlugin: Plugin = {
  name: "sleeper-caffeine-development-csp",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace(
      "style-src 'self' https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
  },
};

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: [
          "@sleeper-caffeine/codex-runtime",
          "@sleeper-caffeine/core",
          "@sleeper-caffeine/ipc-contract",
          "@sleeper-caffeine/mcp",
        ],
      },
      rollupOptions: { input: resolve("src/main/index.ts") },
    },
  },
  preload: {
    build: {
      externalizeDeps: {
        exclude: ["@sleeper-caffeine/ipc-contract", "zod"],
      },
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react(), developmentCspPlugin],
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
