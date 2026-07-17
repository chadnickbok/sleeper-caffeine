import type {
  AiReport,
  CodexStatus,
  ReportKind,
} from "@sleeper-caffeine/ipc-contract";
import { REPORT_STALE_AFTER_MS } from "@sleeper-caffeine/ipc-contract";
import { caffeineClient } from "../../api/caffeine-client.js";
import {
  Page,
  PageHeading,
  SectionTitle,
} from "../../components/layout/PageLayout.js";
import { Button, Icon, Panel } from "../../components/ui/index.js";
import styles from "./ReportPage.module.css";

export function ReportPage({
  kind,
  eyebrow,
  title,
  description,
  report,
  generating,
  onGenerate,
  onLogin,
  codex,
}: {
  kind: ReportKind;
  eyebrow: string;
  title: string;
  description: string;
  report: AiReport | null;
  generating: ReportKind | null;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
}) {
  const running = generating === kind;
  return (
    <Page>
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={
          <AiAction
            status={codex}
            running={running}
            hasReport={Boolean(report)}
            onGenerate={() => onGenerate(kind)}
            onLogin={onLogin}
          />
        }
      />
      {running ? (
        <GeneratingState />
      ) : report ? (
        <ReportView report={report} />
      ) : (
        <ReportEmpty kind={kind} />
      )}
    </Page>
  );
}

export function ReportView({
  report,
  hideLead = false,
}: {
  report: AiReport;
  hideLead?: boolean;
}) {
  const stale = isStaleReport(report);
  return (
    <div className={styles.report}>
      {stale && (
        <div className={styles.stale}>
          <Icon name="refresh" />
          <span>
            <strong>Sleeper data changed</strong>
            <small>
              This report is preserved for history, but regenerate it before
              acting.
            </small>
          </span>
        </div>
      )}
      {!hideLead && (
        <Panel className={styles.lead}>
          <span
            className={`${styles.confidence} ${styles[report.payload.confidence]}`}
          >
            {report.payload.confidence} confidence
          </span>
          <h2>{report.payload.headline}</h2>
          <p>{report.payload.summary}</p>
          <small>
            Generated {formatDate(report.generatedAt)} · snapshot{" "}
            {formatDate(report.snapshotAt)}
          </small>
        </Panel>
      )}
      <div className={styles.cardGrid}>
        {report.payload.cards.map((card, index) => (
          <article
            className={`${styles.card} ${styles[card.tone]}`}
            key={`${card.title}-${String(index)}`}
          >
            <span className={styles.index}>0{index + 1}</span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
            {card.bullets.length > 0 && (
              <ul>
                {card.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      <Panel className={styles.actions}>
        <SectionTitle eyebrow="Decision queue" title="Recommended actions" />
        {report.payload.actions.map((action) => (
          <div className={styles.action} key={action.title}>
            <span className={`${styles.priority} ${styles[action.priority]}`}>
              {action.priority}
            </span>
            <div>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
            </div>
          </div>
        ))}
      </Panel>
      <details className={styles.sources}>
        <summary>
          <span>
            <small>Evidence</small>
            <strong>Sources, assumptions and watch list</strong>
          </span>
          <em>
            {report.payload.sources.length} sources ·{" "}
            {report.payload.caveats.length} caveats
          </em>
          <Icon name="chevron" />
        </summary>
        <div className={styles.sourceContent}>
          {report.payload.sources.map((source, index) => (
            <button
              className={styles.source}
              key={`${source.title}-${String(index)}`}
              onClick={() =>
                source.url && void caffeineClient.openExternal(source.url)
              }
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
              </div>
              {source.url && <Icon name="external" />}
            </button>
          ))}
          {report.payload.caveats.length > 0 && (
            <div className={styles.caveats}>
              <strong>Watch list</strong>
              {report.payload.caveats.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

export function AiAction({
  status,
  running,
  hasReport,
  onGenerate,
  onLogin,
}: {
  status: CodexStatus;
  running: boolean;
  hasReport: boolean;
  onGenerate(): void;
  onLogin(): void;
}) {
  if (status.state === "signed_out")
    return (
      <Button
        variant="primary"
        leading={<Icon name="spark" />}
        onClick={onLogin}
      >
        Connect ChatGPT
      </Button>
    );
  if (status.state === "unavailable")
    return <Button disabled>Codex not installed</Button>;
  return (
    <Button
      variant="primary"
      loading={running}
      leading={<Icon name="spark" />}
      onClick={onGenerate}
      disabled={status.state !== "ready"}
    >
      {running ? "Researching…" : hasReport ? "Regenerate" : "Generate report"}
    </Button>
  );
}

export function GeneratingState({
  title = "Researching your league",
}: {
  title?: string;
}) {
  return (
    <Panel className={styles.generating}>
      <div className={styles.radar}>
        <span />
        <span />
        <i />
      </div>
      <div>
        <small>Codex is working</small>
        <h2>{title}</h2>
        <p>
          Reading Sleeper data, searching the live web, and separating discovery
          from sourced evidence.
        </p>
      </div>
    </Panel>
  );
}

function ReportEmpty({ kind }: { kind: ReportKind }) {
  const copy = {
    team_analysis: [
      "Know exactly what you have",
      "Strengths, weak links, dead weight, pick context, and uncomfortable truths.",
    ],
    trade_suggestions: [
      "Find the actual market",
      "Every roster matters. Your league's needs matter. Generic calculators do not know either.",
    ],
    draft_candidates: [
      "Build your short list",
      "Targets shaped by this roster, this scoring system, and the board as it stands.",
    ],
  }[kind];
  const icon =
    kind === "trade_suggestions"
      ? "swap"
      : kind === "draft_candidates"
        ? "target"
        : "pulse";
  return (
    <Panel className={styles.empty}>
      <span>
        <Icon name={icon} />
      </span>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      <small>No AI turn has been spent yet.</small>
    </Panel>
  );
}

function isStaleReport(report: AiReport): boolean {
  return (
    report.invalidated ||
    Date.now() - Date.parse(report.generatedAt) > REPORT_STALE_AFTER_MS
  );
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
