import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "live"
  | "stale"
  | "warning"
  | "danger"
  | "success";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      {...props}
      className={[styles.root, styles[tone], className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
