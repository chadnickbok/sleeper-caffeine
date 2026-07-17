import type { ReactNode } from "react";
import { Panel } from "../ui/index.js";
import styles from "./AiGenerationProgress.module.css";

export function AiGenerationProgress({
  eyebrow = "Codex is working",
  title = "Researching your league",
  description = (
    <>
      Reading Sleeper data, searching the live web, and separating discovery
      from sourced evidence.
    </>
  ),
  stages = [],
  activeStage = 0,
  className,
}: {
  eyebrow?: string | undefined;
  title?: string | undefined;
  description?: ReactNode;
  stages?: readonly string[] | undefined;
  activeStage?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <Panel
      className={[styles.root, className].filter(Boolean).join(" ")}
      aria-live="polite"
      aria-busy="true"
    >
      <div className={styles.radar} aria-hidden="true">
        <span />
        <span />
        <i />
      </div>
      <div className={styles.copy}>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
        <p>{description}</p>
        {stages.length > 0 && (
          <ol className={styles.stages} aria-label="Analysis progress">
            {stages.map((stage, index) => (
              <li
                key={stage}
                className={
                  index < activeStage
                    ? styles.complete
                    : index === activeStage
                      ? styles.active
                      : undefined
                }
                aria-current={index === activeStage ? "step" : undefined}
              >
                <span />
                {stage}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  );
}
