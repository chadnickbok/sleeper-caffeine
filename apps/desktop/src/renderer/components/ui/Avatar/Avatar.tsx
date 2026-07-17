import { useState } from "react";
import styles from "./Avatar.module.css";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({
  name,
  src,
  size = "medium",
  decorative = true,
}: {
  name: string;
  src?: string | null;
  size?: "small" | "medium" | "large";
  decorative?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className={[styles.root, styles[size]].join(" ")}>
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt={decorative ? "" : name}
          onError={() => setFailedSrc(src)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
