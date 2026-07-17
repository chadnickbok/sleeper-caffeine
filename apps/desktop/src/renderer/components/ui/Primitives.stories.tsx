import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Badge } from "./Badge/Badge.js";
import { Button } from "./Button/Button.js";
import { Dialog } from "./Dialog/Dialog.js";
import { Icon } from "./Icon/Icon.js";
import { Panel } from "./Panel/Panel.js";

const meta = {
  title: "Caffeine/Primitives",
  component: Button,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Buttons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button variant="primary" leading={<Icon name="spark" />}>
        Generate analysis
      </Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Clear data</Button>
      <Button loading>Researching</Button>
    </div>
  ),
};

export const Statuses: Story = {
  render: () => (
    <Panel style={{ display: "grid", gap: 12, padding: 24 }}>
      <Badge tone="live">Live</Badge>
      <Badge tone="stale">Stale</Badge>
      <Badge tone="danger">Disconnected</Badge>
    </Panel>
  ),
};

export const Modal: Story = {
  render: function ModalStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          label="Example dialog"
        >
          <div style={{ display: "grid", gap: 16, padding: 24 }}>
            <h2 style={{ margin: 0 }}>Caffeine dialog</h2>
            <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
              Shared focus, backdrop, and Escape behavior live in one primitive.
            </p>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </div>
        </Dialog>
      </>
    );
  },
};
