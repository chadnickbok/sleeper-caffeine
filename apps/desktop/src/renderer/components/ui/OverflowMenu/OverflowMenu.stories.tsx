import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "../Icon/Icon.js";
import {
  OverflowMenu,
  OverflowMenuItem,
  OverflowMenuSeparator,
} from "./OverflowMenu.js";

const meta = {
  title: "Caffeine/Primitives/Overflow menu",
  component: OverflowMenu,
  parameters: { layout: "centered" },
  args: {
    label: "Plan actions",
    children: null,
  },
} satisfies Meta<typeof OverflowMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <OverflowMenu label="Plan actions">
      <OverflowMenuItem
        leading={<Icon name="check" />}
        description="Keep this decision in your weekly history."
      >
        Mark complete
      </OverflowMenuItem>
      <OverflowMenuItem leading={<Icon name="eye" />}>
        Keep watching
      </OverflowMenuItem>
      <OverflowMenuSeparator />
      <OverflowMenuItem leading={<Icon name="ban" />} tone="danger">
        Dismiss recommendation
      </OverflowMenuItem>
    </OverflowMenu>
  ),
};
