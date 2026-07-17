import type { ComponentProps } from "react";
import { Dialog } from "../Dialog/Dialog.js";

export function Drawer(
  props: Omit<ComponentProps<typeof Dialog>, "placement">,
) {
  return <Dialog {...props} placement="right" />;
}
