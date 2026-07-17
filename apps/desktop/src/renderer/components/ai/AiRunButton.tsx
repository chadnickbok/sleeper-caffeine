import type { CodexStatus } from "@sleeper-caffeine/ipc-contract";
import type { ComponentProps } from "react";
import { Button, Icon } from "../ui/index.js";

export type AiRunButtonLabels = {
  connect: string;
  unavailable: string;
  running: string;
  run: string;
  rerun: string;
};

const defaultLabels: AiRunButtonLabels = {
  connect: "Connect ChatGPT",
  unavailable: "Codex not installed",
  running: "Researching…",
  run: "Generate report",
  rerun: "Regenerate",
};

export function AiRunButton({
  status,
  running,
  hasResult,
  labels,
  onRun,
  onLogin,
  disabled,
  leading,
  variant,
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, "children" | "loading" | "onClick"> & {
  status: CodexStatus;
  running: boolean;
  hasResult: boolean;
  labels?: Partial<AiRunButtonLabels> | undefined;
  onRun(): void;
  onLogin(): void;
}) {
  const copy = { ...defaultLabels, ...labels };

  if (status.state === "signed_out") {
    return (
      <Button
        {...buttonProps}
        variant={variant ?? "primary"}
        leading={leading ?? <Icon name="spark" />}
        onClick={onLogin}
        disabled={disabled}
      >
        {copy.connect}
      </Button>
    );
  }

  if (status.state === "unavailable") {
    return (
      <Button {...buttonProps} variant={variant ?? "secondary"} disabled>
        {copy.unavailable}
      </Button>
    );
  }

  return (
    <Button
      {...buttonProps}
      variant={variant ?? "primary"}
      loading={running}
      leading={leading ?? <Icon name="spark" />}
      onClick={onRun}
      disabled={disabled || status.state !== "ready"}
    >
      {running ? copy.running : hasResult ? copy.rerun : copy.run}
    </Button>
  );
}
