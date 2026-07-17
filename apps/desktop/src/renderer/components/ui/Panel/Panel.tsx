import type { HTMLAttributes } from "react";
import styles from "./Panel.module.css";

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      {...props}
      className={[styles.root, className].filter(Boolean).join(" ")}
    />
  );
}
