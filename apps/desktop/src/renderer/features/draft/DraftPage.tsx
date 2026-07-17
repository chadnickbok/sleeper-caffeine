import { useState, type CSSProperties } from "react";
import type {
  AiReport,
  CodexStatus,
  Dashboard,
  DraftCandidateView,
  DraftPlan,
  ReportKind,
} from "@sleeper-caffeine/ipc-contract";
import {
  Page,
  PageHeading,
  SectionTitle,
} from "../../components/layout/PageLayout.js";
import { Button, Icon, Panel } from "../../components/ui/index.js";
import { PlayerPhoto } from "../../components/player/PlayerPhoto.js";
import {
  AiAction,
  GeneratingState,
  ReportView,
} from "../reports/ReportPage.js";
import {
  selectLivePlanRecommendations,
  selectVisibleDraftCandidates,
} from "./candidate-selectors.js";
import styles from "./DraftPage.module.css";

export function DraftPage({
  dashboard,
  report,
  generating,
  onGenerate,
  onLogin,
  codex,
  onRefresh,
  onTogglePin,
}: {
  dashboard: Dashboard;
  report: AiReport | null;
  generating: ReportKind | null;
  onGenerate(kind: ReportKind): void;
  onLogin(): void;
  codex: CodexStatus;
  onRefresh(): void;
  onTogglePin(playerId: string): void;
}) {
  const running = generating === "draft_candidates";
  const draft = dashboard.draft;
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(
    null,
  );
  const plan = report?.draftPlan ?? null;
  const activePlan =
    plan &&
    ["current", "advanced_valid", "fallback_active", "research_stale"].includes(
      plan.status,
    )
      ? plan
      : null;
  const livePlanRecommendations = selectLivePlanRecommendations(
    draft?.candidates ?? [],
    activePlan,
  );
  const recommendationById = new Map(
    livePlanRecommendations.map((recommendation) => [
      recommendation.player.playerId,
      recommendation,
    ]),
  );
  const visibleCandidates = selectVisibleDraftCandidates({
    candidates: draft?.candidates ?? [],
    recommendations: livePlanRecommendations,
    position,
    query,
  });
  const nextPick = draft?.myUpcomingPickNumbers[0] ?? null;
  const completedSelection = plan?.selectedPlayerId
    ? plan.recommendations.find(
        (item) => item.player.playerId === plan.selectedPlayerId,
      )?.player
    : null;
  const activeRecommendation = activePlan?.activeRecommendationPlayerId
    ? (activePlan.recommendations.find(
        (item) =>
          item.player.playerId === activePlan.activeRecommendationPlayerId,
      ) ?? null)
    : null;
  const intelligenceHeadline = running
    ? "Caffeine is rebuilding the decision board."
    : activePlan?.status === "fallback_active" && activeRecommendation
      ? `Pivot to ${activeRecommendation.player.name} at #${String(activePlan.targetPickNo)}`
      : activePlan
        ? (report?.microSummary?.headline ?? report?.payload.headline)
        : plan?.status === "completed"
          ? `${completedSelection?.name ?? "Your target"} was selected at #${String(plan.targetPickNo)}`
          : plan?.status === "superseded"
            ? "The previous plan no longer matches the live board."
            : "Build one researched plan for the next decision.";
  const intelligenceSummary = running
    ? "Comparing the focused candidate band with the latest board, roster construction, and current reporting."
    : activePlan?.status === "fallback_active" && activeRecommendation
      ? `${activeRecommendation.rationale} The original primary target is no longer available, so this approved fallback now leads the plan.`
      : activePlan
        ? (report?.microSummary?.summary ?? report?.payload.summary)
        : plan?.status === "completed"
          ? "That decision is preserved in history. The live baseline below has already moved on to your next owned pick."
          : (plan?.statusReason ??
            "The Live Baseline is ready now. Build a Caffeine Plan when you want researched rankings, fallbacks, and a coherent pick strategy.");
  const planStatusLabel = running
    ? "Building Caffeine Plan"
    : activePlan?.status === "fallback_active"
      ? "Fallback activated"
      : activePlan?.status === "advanced_valid"
        ? "Plan still valid · board advanced"
        : activePlan?.status === "research_stale"
          ? "Plan research needs refresh"
          : activePlan
            ? "Caffeine Plan current"
            : plan?.status === "completed"
              ? "Last decision completed"
              : plan
                ? "Previous plan superseded"
                : "Live Baseline only";
  return (
    <Page className={styles.root}>
      <PageHeading
        eyebrow="Live room"
        title="Draft command"
        description="Live Sleeper picks drive the board. Candidate ranking is local; deeper intelligence is regenerated on demand."
        action={
          <Button
            variant="ghost"
            leading={<Icon name="refresh" />}
            onClick={onRefresh}
          >
            Refresh board
          </Button>
        }
      />
      <DraftBoard dashboard={dashboard} />
      {draft && draft.status !== "unsupported" && (
        <>
          <section className="draft-intelligence-section">
            <SectionTitle
              eyebrow="Live intelligence"
              title={
                nextPick
                  ? `Your plan at #${String(nextPick)}`
                  : "Your live draft plan"
              }
            />
            <Panel className="draft-intelligence">
              <div className="draft-intelligence-status">
                <span>
                  <i
                    className={
                      !activePlan || activePlan.status === "research_stale"
                        ? "stale"
                        : ""
                    }
                  />
                  {planStatusLabel}
                </span>
                <small>
                  {activePlan
                    ? `Plan based on ${String(activePlan.basedOnPickCount)} picks`
                    : `Live board has ${String(draft.picks.length)} of ${String(draft.totalPicks ?? "—")} picks`}
                </small>
              </div>
              <div className="draft-intelligence-body">
                <article className="draft-change-card">
                  <div className="draft-card-kicker">
                    {running
                      ? "Researching"
                      : activePlan
                        ? "Caffeine recommendation"
                        : plan?.status === "completed"
                          ? "Last decision"
                          : "Next decision"}
                    <span>{draft.picks.length} picks made</span>
                  </div>
                  <h2>{intelligenceHeadline}</h2>
                  <p>{intelligenceSummary}</p>
                </article>
                <div className="draft-decision-board">
                  <div className="draft-decision-head">
                    <div>
                      <span>
                        {activePlan ? "Caffeine Plan" : "Live Baseline"}
                      </span>
                      <strong>
                        {activePlan
                          ? "Researched options for your build"
                          : "Available now · not yet researched"}
                      </strong>
                    </div>
                    <small>
                      {nextPick ? `AT #${String(nextPick)}` : "LIVE"}
                    </small>
                  </div>
                  {activePlan
                    ? livePlanRecommendations.slice(0, 3).map((item) => (
                        <button
                          className="draft-decision-row"
                          key={item.player.playerId}
                          onClick={() =>
                            setExpandedCandidate(item.player.playerId)
                          }
                        >
                          <span>{String(item.planRank).padStart(2, "0")}</span>
                          <div>
                            <strong>{item.player.name}</strong>
                            <small>
                              {item.player.position ?? "—"} ·{" "}
                              {item.player.nflTeam ?? "FA"}
                            </small>
                          </div>
                          <div>
                            <em>{planRoleLabel(item.role)}</em>
                            <small>{item.rationale}</small>
                          </div>
                          <i />
                        </button>
                      ))
                    : draft.candidates.slice(0, 3).map((candidate) => (
                        <button
                          className="draft-decision-row"
                          key={candidate.player.playerId}
                          onClick={() =>
                            setExpandedCandidate(candidate.player.playerId)
                          }
                        >
                          <span>{String(candidate.rank).padStart(2, "0")}</span>
                          <div>
                            <strong>{candidate.player.name}</strong>
                            <small>
                              {candidate.player.position ?? "—"} ·{" "}
                              {candidate.player.nflTeam ?? "FA"}
                            </small>
                          </div>
                          <div>
                            <em>Baseline</em>
                            <small>{candidate.rationale}</small>
                          </div>
                          <i />
                        </button>
                      ))}
                </div>
                <aside className="draft-pick-action">
                  <div>
                    <span>Your next pick</span>
                    <strong>{nextPick ? `#${String(nextPick)}` : "—"}</strong>
                    {draft.currentPickNo && nextPick && (
                      <small>
                        {Math.max(0, nextPick - draft.currentPickNo)} selections
                        away
                      </small>
                    )}
                  </div>
                  <p>
                    {draft.myUpcomingPickNumbers.length > 1
                      ? `Also own ${draft.myUpcomingPickNumbers
                          .slice(1)
                          .map((pick) => `#${String(pick)}`)
                          .join(" · ")}`
                      : "No later selections currently owned"}
                  </p>
                  <AiAction
                    status={codex}
                    running={running}
                    hasReport={Boolean(activePlan)}
                    onGenerate={() => onGenerate("draft_candidates")}
                    onLogin={onLogin}
                  />
                  <small>
                    Refreshes Sleeper first · researched and board-validated
                  </small>
                </aside>
              </div>
            </Panel>
          </section>

          <Panel className="candidate-board">
            <div className="candidate-board-head">
              <div>
                <span>
                  Live Baseline ·{" "}
                  {nextPick
                    ? `planning for pick #${String(nextPick)}`
                    : "no owned pick remaining"}
                </span>
                <h2>Candidate board</h2>
                <p>
                  Research-list players are guaranteed a look in the next
                  Caffeine Plan without changing baseline rank.
                </p>
              </div>
              <div className="candidate-controls">
                <div className="candidate-filters">
                  {["ALL", "QB", "RB", "WR", "TE"].map((filter) => (
                    <button
                      className={position === filter ? "active" : ""}
                      key={filter}
                      onClick={() => setPosition(filter)}
                    >
                      {filter === "ALL" ? "For you" : filter}
                    </button>
                  ))}
                </div>
                <label className="candidate-search">
                  <Icon name="search" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search all available"
                  />
                </label>
              </div>
            </div>
            <div className="candidate-table-head" aria-hidden="true">
              <span>{activePlan ? "Plan" : "Base"}</span>
              <span>Player</span>
              <span>Sleeper search</span>
              <span>Plan role</span>
              <span>Why here</span>
              <span>Research</span>
            </div>
            <div className="candidate-list">
              {visibleCandidates.map((candidate) => (
                <CandidateRow
                  candidate={candidate}
                  recommendation={recommendationById.get(
                    candidate.player.playerId,
                  )}
                  expanded={expandedCandidate === candidate.player.playerId}
                  onExpand={() =>
                    setExpandedCandidate((current) =>
                      current === candidate.player.playerId
                        ? null
                        : candidate.player.playerId,
                    )
                  }
                  onTogglePin={() => onTogglePin(candidate.player.playerId)}
                  key={candidate.player.playerId}
                />
              ))}
              {visibleCandidates.length === 0 && (
                <div className="candidate-empty">
                  No matching available players.
                </div>
              )}
            </div>
          </Panel>

          {running && <GeneratingState title="Updating the decision board" />}
          {!running && report?.draftPlan && (
            <section className="draft-deep-briefing">
              <SectionTitle
                eyebrow={activePlan ? "Deep briefing" : "Previous plan"}
                title={activePlan ? "Why this plan works" : "Decision history"}
                trailing={
                  <span className="briefing-note">
                    Scoring, roster construction, pick capital and risk
                  </span>
                }
              />
              <ReportView report={report} hideLead />
            </section>
          )}
        </>
      )}
    </Page>
  );
}

function DraftBoard({ dashboard }: { dashboard: Dashboard }) {
  const draft = dashboard.draft;
  if (!draft)
    return (
      <Panel className="empty-panel">
        <Icon name="target" />
        <h3>No draft attached yet</h3>
        <p>
          Once Sleeper creates the draft, its live picks and your upcoming slots
          will land here.
        </p>
      </Panel>
    );
  if (draft.status === "unsupported")
    return (
      <Panel className="empty-panel">
        <Icon name="target" />
        <h3>{capitalize(draft.type)} draft detected</h3>
        <p>
          The spatial board supports linear and snake drafts. Completed picks
          remain available to the analyst, but auction planning needs a
          dedicated budget view.
        </p>
      </Panel>
    );
  const rounds = Array.from(
    { length: draft.rounds ?? 0 },
    (_, index) => index + 1,
  );
  return (
    <Panel className="draft-board">
      <div className="draft-board-head">
        <div>
          <span className="live-dot" />
          {draftStatusLabel(draft.status)} · {draft.picks.length} of{" "}
          {draft.totalPicks ?? "—"} picks
        </div>
        <span>
          Sleeper reports {draft.sourceStatus.replaceAll("_", " ")}
          {draft.currentPickNo
            ? ` · Pick #${String(draft.currentPickNo)} on clock`
            : ""}
        </span>
      </div>
      <div className="draft-matrix-scroll">
        <div
          className="draft-matrix"
          style={{ "--draft-columns": draft.teams ?? 1 } as CSSProperties}
        >
          <div className="draft-owner-row">
            {draft.draftTeams.map((team) => (
              <div
                className={team.isMine ? "draft-owner mine" : "draft-owner"}
                key={team.draftSlot}
              >
                <span>{initials(team.teamName)}</span>
                <strong>{team.teamName}</strong>
              </div>
            ))}
          </div>
          {rounds.map((round) => (
            <div className="draft-round" key={round}>
              {draft.board
                .filter((cell) => cell.round === round)
                .sort((a, b) => a.draftSlot - b.draftSlot)
                .map((cell) => (
                  <div
                    className={draftCellClass(cell)}
                    key={`${String(round)}-${String(cell.draftSlot)}`}
                  >
                    <span>{pickLabel(cell.pickNo, draft.teams ?? 0)}</span>
                    {cell.pick ? (
                      <>
                        <strong>
                          {cell.pick.player?.name ?? "Unknown player"}
                        </strong>
                        <small>
                          {cell.pick.player?.position ?? "—"} ·{" "}
                          {cell.pick.player?.nflTeam ?? "FA"}
                          {cell.pick.isKeeper ? " · Keeper" : ""}
                        </small>
                      </>
                    ) : cell.isOnClock ? (
                      <>
                        <strong>On clock</strong>
                        <small>{cell.ownerTeamName ?? "Owner pending"}</small>
                      </>
                    ) : cell.isMine ? (
                      <>
                        <strong>Your pick</strong>
                        <small>
                          {cell.isTraded ? "Acquired pick" : "Upcoming"}
                        </small>
                      </>
                    ) : cell.isTraded ? (
                      <small className="trade-owner">
                        → {cell.ownerTeamName}
                      </small>
                    ) : (
                      <small>—</small>
                    )}
                  </div>
                ))}
            </div>
          ))}
          <div className="draft-board-footer">
            <span>Your remaining picks</span>
            {draft.myUpcomingPickNumbers.length ? (
              draft.myUpcomingPickNumbers.map((pick) => (
                <strong key={pick}>#{pick}</strong>
              ))
            ) : (
              <em>No remaining picks</em>
            )}
            <small>
              <i /> On clock <i /> Your pick
            </small>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CandidateRow({
  candidate,
  recommendation,
  expanded,
  onExpand,
  onTogglePin,
}: {
  candidate: DraftCandidateView;
  recommendation: DraftPlan["recommendations"][number] | undefined;
  expanded: boolean;
  onExpand(): void;
  onTogglePin(): void;
}) {
  return (
    <div className={expanded ? "candidate-row expanded" : "candidate-row"}>
      <button className="candidate-row-main" onClick={onExpand}>
        <span className="candidate-priority">
          {recommendation
            ? String(recommendation.planRank).padStart(2, "0")
            : String(candidate.rank).padStart(2, "0")}
        </span>
        <div className="candidate-player">
          <PlayerPhoto player={candidate.player} small />
          <div>
            <strong>{candidate.player.name}</strong>
            <small>
              {candidate.player.position ?? "—"} ·{" "}
              {candidate.player.nflTeam ?? "FA"}
            </small>
          </div>
        </div>
        <div className="candidate-market">
          <strong>{candidate.marketRank ?? "—"}</strong>
          <small>Public search order</small>
        </div>
        <span
          className={`candidate-fit ${recommendation ? recommendation.role : candidate.fitLabel}`}
        >
          {recommendation
            ? planRoleLabel(recommendation.role)
            : `Baseline #${String(candidate.rank)}`}
        </span>
        <p>{recommendation?.rationale ?? candidate.rationale}</p>
      </button>
      <button
        className={candidate.pinned ? "candidate-pin pinned" : "candidate-pin"}
        onClick={onTogglePin}
        aria-pressed={candidate.pinned}
      >
        {candidate.pinned ? "Researching" : "+ Research"}
      </button>
      {expanded && (
        <div className="candidate-rationale">
          {recommendation && (
            <div className="candidate-plan-detail">
              <span>Caffeine rationale</span>
              <strong>{recommendation.rationale}</strong>
              {recommendation.risks.length > 0 && (
                <small>Risk: {recommendation.risks.join(" · ")}</small>
              )}
            </div>
          )}
          <div>
            <span>Market</span>
            <ScoreBar value={candidate.scoreBreakdown.market} />
          </div>
          <div>
            <span>Roster fit</span>
            <ScoreBar value={candidate.scoreBreakdown.rosterFit} />
          </div>
          <div>
            <span>Scarcity</span>
            <ScoreBar value={candidate.scoreBreakdown.scarcity} />
          </div>
          <div>
            <span>Pick window</span>
            <ScoreBar value={candidate.scoreBreakdown.pickWindow} />
          </div>
          <div>
            <span>Upside</span>
            <ScoreBar value={candidate.scoreBreakdown.upside} />
          </div>
          <strong>{candidate.score} baseline score</strong>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ value }: { value: number }) {
  return (
    <span className="score-bar">
      <i style={{ width: `${String(value)}%` }} />
      <em>{value}</em>
    </span>
  );
}

function planRoleLabel(value: DraftPlan["recommendations"][number]["role"]) {
  return value === "primary"
    ? "Primary"
    : value === "fallback"
      ? "Fallback"
      : value === "later"
        ? "Later pick"
        : "Avoid";
}

function draftStatusLabel(value: NonNullable<Dashboard["draft"]>["status"]) {
  return value === "live"
    ? "Draft in progress"
    : value === "scheduled"
      ? "Draft scheduled"
      : value === "complete"
        ? "Draft complete"
        : value === "pending"
          ? "Slow draft waiting"
          : "Draft view unavailable";
}

function draftCellClass(
  cell: NonNullable<Dashboard["draft"]>["board"][number],
) {
  return [
    "draft-cell",
    cell.pick ? "filled" : "empty",
    cell.isMine ? "mine" : "",
    cell.isOnClock ? "on-clock" : "",
    cell.isTraded ? "traded" : "",
    cell.pick?.player?.position
      ? `position-${cell.pick.player.position.toLowerCase()}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function pickLabel(pickNo: number, teams: number) {
  if (teams <= 0) return `#${String(pickNo)}`;
  const round = Math.floor((pickNo - 1) / teams) + 1;
  const position = ((pickNo - 1) % teams) + 1;
  return `${String(round)}.${String(position)}`;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
function capitalize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
