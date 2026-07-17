import type { Preview } from "@storybook/react-vite";
import "../src/renderer/styles/tokens.css";
import "../src/renderer/styles/reset.css";
import "../src/renderer/styles/globals.css";

const preview: Preview = {
  parameters: {
    a11y: { test: "error" },
    backgrounds: { default: "caffeine" },
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ minWidth: 320, padding: 32 }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
