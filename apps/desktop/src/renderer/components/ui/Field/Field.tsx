import { useId, type ReactElement, type ReactNode } from "react";
import styles from "./Field.module.css";

export function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactElement;
}) {
  const id = useId();
  const descriptionId = description || error ? `${id}-description` : undefined;
  return (
    <label className={styles.root} htmlFor={id}>
      <span>{label}</span>
      {children({
        id,
        ...(descriptionId ? { "aria-describedby": descriptionId } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {(description || error) && (
        <small id={descriptionId} className={error ? styles.error : undefined}>
          {(error ?? description) as ReactNode}
        </small>
      )}
    </label>
  );
}
