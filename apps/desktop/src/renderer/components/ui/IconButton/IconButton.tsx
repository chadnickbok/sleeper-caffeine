import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

export function IconButton({
  label,
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      title={props.title ?? label}
      className={[styles.root, className].filter(Boolean).join(" ")}
    >
      {children}
    </button>
  );
}
