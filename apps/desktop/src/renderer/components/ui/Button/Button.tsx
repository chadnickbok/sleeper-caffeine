import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "small" | "medium";

export function Button({
  children,
  className,
  variant = "secondary",
  size = "medium",
  loading = false,
  leading,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: ReactNode;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[styles.root, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        leading
      )}
      <span>{children}</span>
    </button>
  );
}
