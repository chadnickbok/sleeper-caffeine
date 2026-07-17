import styles from "./StatusDot.module.css";

export function StatusDot({
  tone = "neutral",
}: {
  tone?: "neutral" | "live" | "warning" | "danger";
}) {
  return (
    <span
      className={[styles.root, styles[tone]].join(" ")}
      aria-hidden="true"
    />
  );
}
