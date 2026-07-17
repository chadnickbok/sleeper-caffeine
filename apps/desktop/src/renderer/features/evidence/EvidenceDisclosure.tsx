import { caffeineClient } from "../../api/caffeine-client.js";
import { Icon } from "../../components/ui/index.js";
import { formatRelativeTime } from "../../lib/time.js";
import styles from "./EvidenceDisclosure.module.css";

export type EvidenceDisclosureSource = {
  id?: string | null | undefined;
  evidenceId?: string | null | undefined;
  title: string;
  url: string | null;
  claim: string;
  sourceType: "provider" | "sleeper" | "web";
  fetchedAt?: string | null | undefined;
};

export function EvidenceDisclosure({
  sources,
  caveats = [],
  eyebrow = "Evidence",
  title = "Sources, assumptions and watch list",
  summary,
  caveatTitle = "Watch list",
  showFreshness = false,
  defaultOpen = false,
  className,
  onOpenSource,
}: {
  sources: readonly EvidenceDisclosureSource[];
  caveats?: readonly string[] | undefined;
  eyebrow?: string | undefined;
  title?: string | undefined;
  summary?: string | undefined;
  caveatTitle?: string | undefined;
  showFreshness?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  className?: string | undefined;
  onOpenSource?:
    | ((source: EvidenceDisclosureSource) => Promise<void> | void)
    | undefined;
}) {
  const sourceSummary =
    summary ??
    `${String(sources.length)} sources · ${String(caveats.length)} caveats`;

  const openSource = (source: EvidenceDisclosureSource) => {
    if (!source.url) return;
    if (onOpenSource) {
      void onOpenSource(source);
      return;
    }
    void caffeineClient.openExternal(source.url);
  };

  return (
    <details
      className={[styles.root, className].filter(Boolean).join(" ")}
      open={defaultOpen || undefined}
    >
      <summary>
        <span>
          <small>{eyebrow}</small>
          <strong>{title}</strong>
        </span>
        <em>{sourceSummary}</em>
        <Icon name="chevron" />
      </summary>
      <div className={styles.content}>
        {sources.map((source, index) => (
          <button
            className={styles.source}
            key={
              source.evidenceId ??
              source.id ??
              `${source.title}-${String(index)}`
            }
            onClick={() => openSource(source)}
            disabled={!source.url}
          >
            <span
              className={`${styles.sourceType} ${styles[source.sourceType]}`}
            >
              {source.sourceType}
            </span>
            <div>
              <strong>{source.title}</strong>
              <p>{source.claim}</p>
              {showFreshness && source.fetchedAt && (
                <small>Fetched {formatRelativeTime(source.fetchedAt)}</small>
              )}
            </div>
            {source.url && <Icon name="external" />}
          </button>
        ))}
        {caveats.length > 0 && (
          <div className={styles.caveats}>
            <strong>{caveatTitle}</strong>
            {caveats.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
