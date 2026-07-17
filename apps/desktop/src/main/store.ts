import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AiReport,
  AiSettings,
  ChatHistoryCursor,
  ChatHistoryPage,
  ChatMessage,
  CurrentWeeklyBriefs,
  Dashboard,
  DraftPlan,
  EvidenceClaim,
  LeagueWeek,
  LeagueWeekKey,
  MicroSummary,
  ProviderIdentity,
  ReportKind,
  ReportPayload,
  SavedLeague,
  SleeperEvent,
  TeamChoice,
  WatchlistEntry,
  WeeklyAction,
  WeeklyActionStatus,
  WeeklyChange,
  WeeklyPhase,
  WeeklyPhaseBrief,
  WeeklyPhaseBriefKey,
  WeeklyPlan,
  WeeklyPlanBundle,
  WeeklyPlanStatus,
  WeeklyPlanSummary,
} from "@sleeper-caffeine/ipc-contract";
import {
  AiSettingsSchema,
  DEFAULT_AI_SETTINGS,
  DraftPlanSchema,
  EvidenceClaimSchema,
  EMPTY_CURRENT_WEEKLY_BRIEFS,
  LeagueWeekSchema,
  MicroSummarySchema,
  ProviderIdentitySchema,
  REPORT_STALE_AFTER_MS,
  SleeperEventSchema,
  WatchlistEntrySchema,
  WeeklyActionSchema,
  WeeklyPhaseBriefSchema,
  WeeklyPlanSchema,
  WeeklyPlanSummarySchema,
} from "@sleeper-caffeine/ipc-contract";
import { STORE_MIGRATIONS } from "./migrations.js";
import { deriveWeeklyPlanSummary } from "./weekly-plan.js";

type LeagueRow = {
  league_id: string;
  name: string;
  season: string;
  roster_id: number;
  user_id: string;
  team_name: string;
  avatar: string | null;
  last_refreshed_at: string | null;
  is_active: number;
  snapshot_json: string | null;
};

type LeagueWeekRow = {
  league_id: string;
  season: string;
  week: number;
  phase: WeeklyPhase;
  latest_snapshot_at: string | null;
  latest_context_json: string | null;
  latest_context_hash: string | null;
  current_plan_id: string | null;
  competitive_lane: LeagueWeek["competitiveLane"];
  plan_status: WeeklyPlanStatus;
  meaningful_changes_json: string;
  updated_at: string;
};

type WeeklyPlanRow = {
  id: string;
  league_id: string;
  season: string;
  week: number;
  version: number;
  source_snapshot_id: string;
  input_hash: string;
  evidence_hash: string;
  generated_at: string;
  research_fresh_through: string;
  model: string;
  reasoning_effort: string;
  prompt_version: string;
  schema_version: string;
  lifecycle_status: WeeklyPlan["status"];
  status_reason: string | null;
  output_json: string;
  players_json: string;
  rosters_json: string;
  micro_summary_json: string | null;
};

type WeeklyActionRow = {
  id: string;
  plan_id: string;
  league_id: string;
  season: string;
  week: number;
  action_key: string;
  kind: WeeklyAction["kind"];
  status: WeeklyActionStatus;
  title: string;
  description: string;
  priority: WeeklyAction["priority"];
  player_ids_json: string;
  roster_ids_json: string;
  disposition_note: string | null;
  observed_event_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type WeeklyPhaseBriefRow = {
  id: string;
  league_id: string;
  season: string;
  week: number;
  phase: WeeklyPhaseBrief["phase"];
  version: number;
  source_snapshot_id: string;
  source_plan_id: string | null;
  input_hash: string;
  evidence_hash: string;
  generated_at: string;
  data_fresh_through: string;
  research_fresh_through: string;
  model: string;
  reasoning_effort: string;
  prompt_version: string;
  schema_version: string;
  output_json: string;
  players_json: string;
};

export type WeeklyContextRecord = LeagueWeekKey & {
  snapshotAt: string | null;
  contextHash: string | null;
  context: unknown;
};

export type WeeklyContextInput = LeagueWeekKey & {
  phase: WeeklyPhase;
  snapshotAt: string;
  contextHash: string;
  context: unknown;
  meaningfulChanges?: WeeklyChange[];
};

export class LocalStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  listLeagues(): SavedLeague[] {
    const rows = this.database
      .prepare("SELECT * FROM leagues ORDER BY is_active DESC, name ASC")
      .all() as LeagueRow[];
    return rows.map(toSavedLeague);
  }

  getActiveLeague(): SavedLeague | null {
    const row = this.database
      .prepare("SELECT * FROM leagues WHERE is_active = 1 LIMIT 1")
      .get() as LeagueRow | undefined;
    return row ? toSavedLeague(row) : null;
  }

  getDashboard(leagueId: string): Dashboard | null {
    const row = this.database
      .prepare("SELECT snapshot_json FROM leagues WHERE league_id = ?")
      .get(leagueId) as { snapshot_json: string | null } | undefined;
    return row?.snapshot_json
      ? (JSON.parse(row.snapshot_json) as Dashboard)
      : null;
  }

  saveLeague(input: {
    leagueId: string;
    name: string;
    season: string;
    team: TeamChoice;
  }): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE leagues SET is_active = 0").run();
      this.database
        .prepare(
          `INSERT INTO leagues (league_id, name, season, roster_id, user_id, team_name, avatar, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(league_id) DO UPDATE SET
             name = excluded.name, season = excluded.season, roster_id = excluded.roster_id,
             user_id = excluded.user_id, team_name = excluded.team_name, avatar = excluded.avatar, is_active = 1`,
        )
        .run(
          input.leagueId,
          input.name,
          input.season,
          input.team.rosterId,
          input.team.userId,
          input.team.teamName,
          input.team.avatar,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  setActiveLeague(leagueId: string): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE leagues SET is_active = 0").run();
      const result = this.database
        .prepare("UPDATE leagues SET is_active = 1 WHERE league_id = ?")
        .run(leagueId);
      if (result.changes !== 1) throw new Error("League not found");
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveDashboard(dashboard: Dashboard, rawSnapshot: unknown): void {
    const json = JSON.stringify(dashboard);
    const raw = JSON.stringify(rawSnapshot);
    const previous = this.getDashboard(dashboard.league.leagueId);
    const draftBoardChanged =
      previous !== null &&
      previous.draft?.boardHash !== dashboard.draft?.boardHash;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          "UPDATE leagues SET snapshot_json = ?, last_refreshed_at = ? WHERE league_id = ?",
        )
        .run(json, dashboard.capturedAt, dashboard.league.leagueId);
      this.database
        .prepare(
          "INSERT INTO league_snapshots (id, league_id, captured_at, dashboard_json, raw_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          randomUUID(),
          dashboard.league.leagueId,
          dashboard.capturedAt,
          json,
          raw,
        );
      this.database
        .prepare(
          `UPDATE ai_reports
           SET invalidated = CASE
             WHEN invalidated = 1 OR generated_at < ? THEN 1
             ELSE 0
           END
           WHERE league_id = ?`,
        )
        .run(
          new Date(
            Date.parse(dashboard.capturedAt) - REPORT_STALE_AFTER_MS,
          ).toISOString(),
          dashboard.league.leagueId,
        );
      if (draftBoardChanged) {
        this.database
          .prepare(
            "UPDATE ai_reports SET invalidated = 1 WHERE league_id = ? AND kind = 'draft_candidates'",
          )
          .run(dashboard.league.leagueId);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  updateDashboardCache(dashboard: Dashboard): void {
    this.database
      .prepare("UPDATE leagues SET snapshot_json = ? WHERE league_id = ?")
      .run(JSON.stringify(dashboard), dashboard.league.leagueId);
  }

  getLatestSnapshotId(leagueId: string): string | null {
    const row = this.database
      .prepare(
        `SELECT id FROM league_snapshots
         WHERE league_id = ? ORDER BY captured_at DESC, rowid DESC LIMIT 1`,
      )
      .get(leagueId) as { id: string } | undefined;
    return row?.id ?? null;
  }

  getPinnedDraftCandidateIds(leagueId: string): Set<string> {
    const rows = this.database
      .prepare(
        "SELECT player_id FROM draft_candidate_pins WHERE league_id = ? ORDER BY created_at ASC",
      )
      .all(leagueId) as Array<{ player_id: string }>;
    return new Set(rows.map((row) => row.player_id));
  }

  toggleDraftCandidatePin(leagueId: string, playerId: string): boolean {
    const existing = this.database
      .prepare(
        "SELECT 1 AS present FROM draft_candidate_pins WHERE league_id = ? AND player_id = ?",
      )
      .get(leagueId, playerId) as { present: number } | undefined;
    if (existing) {
      this.database
        .prepare(
          "DELETE FROM draft_candidate_pins WHERE league_id = ? AND player_id = ?",
        )
        .run(leagueId, playerId);
      return false;
    }
    this.database
      .prepare(
        "INSERT INTO draft_candidate_pins (league_id, player_id, created_at) VALUES (?, ?, ?)",
      )
      .run(leagueId, playerId, new Date().toISOString());
    return true;
  }

  getLeagueWeek(key: LeagueWeekKey): LeagueWeek | null {
    const row = this.database
      .prepare(
        "SELECT * FROM league_weeks WHERE league_id = ? AND season = ? AND week = ?",
      )
      .get(key.leagueId, key.season, key.week) as LeagueWeekRow | undefined;
    return row ? this.toLeagueWeek(row) : null;
  }

  listLeagueWeeks(leagueId: string): LeagueWeek[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM league_weeks WHERE league_id = ? ORDER BY season DESC, week DESC",
      )
      .all(leagueId) as LeagueWeekRow[];
    return rows.map((row) => this.toLeagueWeek(row));
  }

  upsertLeagueWeek(input: LeagueWeek): LeagueWeek {
    const leagueWeek = LeagueWeekSchema.parse(input);
    this.database
      .prepare(
        `INSERT INTO league_weeks (
           league_id, season, week, phase, latest_snapshot_at, current_plan_id,
           competitive_lane, plan_status, meaningful_changes_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(league_id, season, week) DO UPDATE SET
           phase = excluded.phase,
           latest_snapshot_at = excluded.latest_snapshot_at,
           current_plan_id = excluded.current_plan_id,
           competitive_lane = excluded.competitive_lane,
           plan_status = excluded.plan_status,
           meaningful_changes_json = excluded.meaningful_changes_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        leagueWeek.leagueId,
        leagueWeek.season,
        leagueWeek.week,
        leagueWeek.phase,
        leagueWeek.latestSnapshotAt,
        leagueWeek.currentPlanId,
        leagueWeek.competitiveLane,
        leagueWeek.planStatus,
        JSON.stringify(leagueWeek.meaningfulChanges),
        leagueWeek.updatedAt,
      );
    return this.getLeagueWeek(leagueWeek) ?? leagueWeek;
  }

  saveWeeklyContext(input: WeeklyContextInput): LeagueWeek {
    const previous = this.getLeagueWeek(input);
    const meaningfulChanges = input.meaningfulChanges ?? [];
    const hasMaterialChange = meaningfulChanges.some(
      (change) => change.material,
    );
    const updatedAt = new Date().toISOString();
    const planStatus =
      previous?.currentPlanId && hasMaterialChange
        ? "data_changed"
        : (previous?.planStatus ?? "not_built");
    this.database
      .prepare(
        `INSERT INTO league_weeks (
           league_id, season, week, phase, latest_snapshot_at,
           latest_context_json, latest_context_hash, current_plan_id,
           competitive_lane, plan_status, meaningful_changes_json, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(league_id, season, week) DO UPDATE SET
           phase = excluded.phase,
           latest_snapshot_at = excluded.latest_snapshot_at,
           latest_context_json = excluded.latest_context_json,
           latest_context_hash = excluded.latest_context_hash,
           plan_status = excluded.plan_status,
           meaningful_changes_json = excluded.meaningful_changes_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.leagueId,
        input.season,
        input.week,
        input.phase,
        input.snapshotAt,
        JSON.stringify(input.context),
        input.contextHash,
        previous?.currentPlanId ?? null,
        previous?.competitiveLane ?? null,
        planStatus,
        JSON.stringify(meaningfulChanges),
        updatedAt,
      );
    const saved = this.getLeagueWeek(input);
    if (!saved) throw new Error("Failed to save weekly context");
    return saved;
  }

  getWeeklyContext(key: LeagueWeekKey): WeeklyContextRecord | null {
    const row = this.database
      .prepare(
        `SELECT latest_snapshot_at, latest_context_hash, latest_context_json
         FROM league_weeks WHERE league_id = ? AND season = ? AND week = ?`,
      )
      .get(key.leagueId, key.season, key.week) as
      | {
          latest_snapshot_at: string | null;
          latest_context_hash: string | null;
          latest_context_json: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      leagueId: key.leagueId,
      season: key.season,
      week: key.week,
      snapshotAt: row.latest_snapshot_at,
      contextHash: row.latest_context_hash,
      context: row.latest_context_json
        ? JSON.parse(row.latest_context_json)
        : null,
    };
  }

  getNextWeeklyPlanVersion(key: LeagueWeekKey): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM weekly_plan_versions
         WHERE league_id = ? AND season = ? AND week = ?`,
      )
      .get(key.leagueId, key.season, key.week) as { next_version: number };
    return row.next_version;
  }

  saveWeeklyPlan(
    input: WeeklyPlan,
    actionInputs: WeeklyAction[] = [],
    evidenceInputs: EvidenceClaim[] = [],
  ): WeeklyPlanBundle {
    const plan = WeeklyPlanSchema.parse(input);
    const actions = actionInputs.map((action) =>
      WeeklyActionSchema.parse(action),
    );
    const evidence = scopeEvidenceClaims(
      evidenceInputs.map((claim) => EvidenceClaimSchema.parse(claim)),
      { kind: "plan", id: plan.id, leagueId: plan.leagueId },
    );
    const expectedVersion = this.getNextWeeklyPlanVersion(plan);
    if (plan.version !== expectedVersion)
      throw new Error(
        `Weekly plan version ${plan.version} is not the next version (${expectedVersion})`,
      );
    for (const action of actions) {
      if (
        action.planId !== plan.id ||
        action.leagueId !== plan.leagueId ||
        action.season !== plan.season ||
        action.week !== plan.week
      )
        throw new Error(
          `Weekly action ${action.id} does not belong to plan ${plan.id}`,
        );
    }

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO league_weeks (
             league_id, season, week, phase, latest_snapshot_at, current_plan_id,
             competitive_lane, plan_status, meaningful_changes_json, updated_at
           ) VALUES (?, ?, ?, 'tuesday', ?, NULL, NULL, 'not_built', '[]', ?)
           ON CONFLICT(league_id, season, week) DO NOTHING`,
        )
        .run(
          plan.leagueId,
          plan.season,
          plan.week,
          plan.generatedAt,
          plan.generatedAt,
        );
      this.database
        .prepare(
          `UPDATE weekly_plan_versions
           SET lifecycle_status = 'superseded', status_reason = ?
           WHERE league_id = ? AND season = ? AND week = ?
             AND lifecycle_status != 'superseded'`,
        )
        .run(
          `Superseded by plan ${plan.id}`,
          plan.leagueId,
          plan.season,
          plan.week,
        );
      this.database
        .prepare(
          `UPDATE weekly_actions SET status = 'superseded', updated_at = ?, resolved_at = ?
           WHERE league_id = ? AND season = ? AND week = ?
             AND status IN ('pending', 'observed_in_sleeper')`,
        )
        .run(
          plan.generatedAt,
          plan.generatedAt,
          plan.leagueId,
          plan.season,
          plan.week,
        );
      this.database
        .prepare(
          `INSERT INTO weekly_plan_versions (
             id, league_id, season, week, version, source_snapshot_id,
             input_hash, evidence_hash, generated_at, research_fresh_through,
             model, reasoning_effort, prompt_version, schema_version,
             lifecycle_status, status_reason, output_json, players_json,
             rosters_json, micro_summary_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          plan.id,
          plan.leagueId,
          plan.season,
          plan.week,
          plan.version,
          plan.sourceSnapshotId,
          plan.inputHash,
          plan.evidenceHash,
          plan.generatedAt,
          plan.researchFreshThrough,
          plan.model,
          plan.reasoningEffort,
          plan.promptVersion,
          plan.schemaVersion,
          plan.status,
          plan.statusReason,
          JSON.stringify(plan.output),
          JSON.stringify(plan.players),
          JSON.stringify(plan.rosters),
          plan.microSummary ? JSON.stringify(plan.microSummary) : null,
        );
      const insertAction = this.database.prepare(
        `INSERT INTO weekly_actions (
           id, plan_id, league_id, season, week, action_key, kind, status,
           title, description, priority, player_ids_json, roster_ids_json,
           disposition_note, observed_event_id, created_at, updated_at, resolved_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const action of actions)
        insertAction.run(
          action.id,
          action.planId,
          action.leagueId,
          action.season,
          action.week,
          action.actionKey,
          action.kind,
          action.status,
          action.title,
          action.description,
          action.priority,
          JSON.stringify(action.playerIds),
          JSON.stringify(action.rosterIds),
          action.dispositionNote,
          action.observedEventId,
          action.createdAt,
          action.updatedAt,
          action.resolvedAt,
        );
      this.upsertEvidenceClaims(evidence);
      this.database
        .prepare(
          `UPDATE league_weeks SET
             current_plan_id = ?, competitive_lane = ?, plan_status = ?,
             updated_at = ?
           WHERE league_id = ? AND season = ? AND week = ?`,
        )
        .run(
          plan.id,
          plan.output.competitiveLane.lane,
          plan.status,
          plan.generatedAt,
          plan.leagueId,
          plan.season,
          plan.week,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const bundle = this.getWeeklyPlanBundle(plan);
    if (!bundle) throw new Error("Failed to reload saved weekly plan");
    return bundle;
  }

  clearWeeklyChanges(key: LeagueWeekKey): LeagueWeek {
    const now = new Date().toISOString();
    const result = this.database
      .prepare(
        `UPDATE league_weeks
         SET meaningful_changes_json = '[]', updated_at = ?
         WHERE league_id = ? AND season = ? AND week = ?`,
      )
      .run(now, key.leagueId, key.season, key.week);
    if (result.changes !== 1) throw new Error("League week not found");
    const leagueWeek = this.getLeagueWeek(key);
    if (!leagueWeek) throw new Error("Failed to reload league week");
    return leagueWeek;
  }

  getWeeklyPlan(planId: string): WeeklyPlan | null {
    const row = this.database
      .prepare("SELECT * FROM weekly_plan_versions WHERE id = ?")
      .get(planId) as WeeklyPlanRow | undefined;
    return row ? toWeeklyPlan(row) : null;
  }

  getCurrentWeeklyPlan(key: LeagueWeekKey): WeeklyPlan | null {
    const row = this.database
      .prepare(
        `SELECT plan.* FROM weekly_plan_versions plan
         JOIN league_weeks week ON week.current_plan_id = plan.id
         WHERE week.league_id = ? AND week.season = ? AND week.week = ?`,
      )
      .get(key.leagueId, key.season, key.week) as WeeklyPlanRow | undefined;
    return row ? toWeeklyPlan(row) : null;
  }

  listWeeklyPlans(key: LeagueWeekKey): WeeklyPlan[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM weekly_plan_versions
         WHERE league_id = ? AND season = ? AND week = ?
         ORDER BY version DESC`,
      )
      .all(key.leagueId, key.season, key.week) as WeeklyPlanRow[];
    return rows.map(toWeeklyPlan);
  }

  getNextWeeklyPhaseBriefVersion(key: WeeklyPhaseBriefKey): number {
    const row = this.database
      .prepare(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM weekly_phase_briefs
         WHERE league_id = ? AND season = ? AND week = ? AND phase = ?`,
      )
      .get(key.leagueId, key.season, key.week, key.phase) as {
      next_version: number;
    };
    return row.next_version;
  }

  saveWeeklyPhaseBrief(
    input: WeeklyPhaseBrief,
    actionInputs: WeeklyAction[] = [],
    evidenceInputs: EvidenceClaim[] = [],
  ): WeeklyPhaseBrief {
    const brief = WeeklyPhaseBriefSchema.parse(input);
    const actions = actionInputs.map((action) =>
      WeeklyActionSchema.parse(action),
    );
    const evidence = scopeEvidenceClaims(
      evidenceInputs.map((claim) => EvidenceClaimSchema.parse(claim)),
      { kind: "brief", id: brief.id, leagueId: brief.leagueId },
    );
    const expectedVersion = this.getNextWeeklyPhaseBriefVersion(brief);
    if (brief.version !== expectedVersion)
      throw new Error(
        `Weekly ${brief.phase} brief version ${brief.version} is not the next version (${expectedVersion})`,
      );

    if (brief.sourcePlanId) {
      const sourcePlan = this.getWeeklyPlan(brief.sourcePlanId);
      if (!sourcePlan)
        throw new Error("Weekly phase brief source plan not found");
      if (
        sourcePlan.leagueId !== brief.leagueId ||
        sourcePlan.season !== brief.season ||
        sourcePlan.week !== brief.week
      )
        throw new Error(
          `Weekly ${brief.phase} brief does not belong to source plan ${sourcePlan.id}`,
        );
    }
    for (const action of actions) {
      if (
        !brief.sourcePlanId ||
        action.planId !== brief.sourcePlanId ||
        action.leagueId !== brief.leagueId ||
        action.season !== brief.season ||
        action.week !== brief.week ||
        !action.actionKey.startsWith(`${brief.phase}:`)
      )
        throw new Error(
          `Weekly action ${action.id} does not belong to ${brief.phase} brief ${brief.id}`,
        );
    }
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `INSERT INTO league_weeks (
             league_id, season, week, phase, latest_snapshot_at, current_plan_id,
             competitive_lane, plan_status, meaningful_changes_json, updated_at
           ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'not_built', '[]', ?)
           ON CONFLICT(league_id, season, week) DO NOTHING`,
        )
        .run(
          brief.leagueId,
          brief.season,
          brief.week,
          brief.phase,
          brief.dataFreshThrough,
          brief.generatedAt,
        );
      this.database
        .prepare(
          `INSERT INTO weekly_phase_briefs (
             id, league_id, season, week, phase, version, source_snapshot_id,
             source_plan_id, input_hash, evidence_hash, generated_at,
             data_fresh_through, research_fresh_through, model,
             reasoning_effort, prompt_version, schema_version, output_json,
             players_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          brief.id,
          brief.leagueId,
          brief.season,
          brief.week,
          brief.phase,
          brief.version,
          brief.sourceSnapshotId,
          brief.sourcePlanId,
          brief.inputHash,
          brief.evidenceHash,
          brief.generatedAt,
          brief.dataFreshThrough,
          brief.researchFreshThrough,
          brief.model,
          brief.reasoningEffort,
          brief.promptVersion,
          brief.schemaVersion,
          JSON.stringify(brief.output),
          JSON.stringify(brief.players),
        );
      this.upsertEvidenceClaims(evidence);
      if (brief.sourcePlanId) {
        this.database
          .prepare(
            `UPDATE weekly_actions
             SET status = 'superseded', updated_at = ?, resolved_at = ?
             WHERE plan_id = ? AND action_key LIKE ?
               AND status IN ('pending', 'observed_in_sleeper')`,
          )
          .run(
            brief.generatedAt,
            brief.generatedAt,
            brief.sourcePlanId,
            `${brief.phase}:%`,
          );
      }
      const upsertAction = this.database.prepare(
        `INSERT INTO weekly_actions (
           id, plan_id, league_id, season, week, action_key, kind, status,
           title, description, priority, player_ids_json, roster_ids_json,
           disposition_note, observed_event_id, created_at, updated_at, resolved_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(plan_id, action_key) DO UPDATE SET
           kind = excluded.kind,
           title = excluded.title,
           description = excluded.description,
           priority = excluded.priority,
           player_ids_json = excluded.player_ids_json,
           roster_ids_json = excluded.roster_ids_json,
           status = CASE
             WHEN weekly_actions.status IN ('completed', 'dismissed', 'declined', 'failed', 'not_possible')
               THEN weekly_actions.status
             ELSE excluded.status
           END,
           disposition_note = CASE
             WHEN weekly_actions.status IN ('completed', 'dismissed', 'declined', 'failed', 'not_possible')
               THEN weekly_actions.disposition_note
             ELSE excluded.disposition_note
           END,
           observed_event_id = CASE
             WHEN weekly_actions.status IN ('completed', 'dismissed', 'declined', 'failed', 'not_possible')
               THEN weekly_actions.observed_event_id
             ELSE excluded.observed_event_id
           END,
           updated_at = excluded.updated_at,
           resolved_at = CASE
             WHEN weekly_actions.status IN ('completed', 'dismissed', 'declined', 'failed', 'not_possible')
               THEN weekly_actions.resolved_at
             ELSE excluded.resolved_at
           END`,
      );
      for (const action of actions)
        upsertAction.run(
          action.id,
          action.planId,
          action.leagueId,
          action.season,
          action.week,
          action.actionKey,
          action.kind,
          action.status,
          action.title,
          action.description,
          action.priority,
          JSON.stringify(action.playerIds),
          JSON.stringify(action.rosterIds),
          action.dispositionNote,
          action.observedEventId,
          action.createdAt,
          action.updatedAt,
          action.resolvedAt,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    const saved = this.getWeeklyPhaseBrief(brief.id);
    if (!saved) throw new Error("Failed to reload weekly phase brief");
    return saved;
  }

  getWeeklyPhaseBrief(briefId: string): WeeklyPhaseBrief | null {
    const row = this.database
      .prepare("SELECT * FROM weekly_phase_briefs WHERE id = ?")
      .get(briefId) as WeeklyPhaseBriefRow | undefined;
    return row ? toWeeklyPhaseBrief(row) : null;
  }

  getCurrentWeeklyPhaseBrief(
    key: WeeklyPhaseBriefKey,
  ): WeeklyPhaseBrief | null {
    const row = this.database
      .prepare(
        `SELECT * FROM weekly_phase_briefs
         WHERE league_id = ? AND season = ? AND week = ? AND phase = ?
         ORDER BY version DESC LIMIT 1`,
      )
      .get(key.leagueId, key.season, key.week, key.phase) as
      | WeeklyPhaseBriefRow
      | undefined;
    return row ? toWeeklyPhaseBrief(row) : null;
  }

  listWeeklyPhaseBriefs(key: WeeklyPhaseBriefKey): WeeklyPhaseBrief[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM weekly_phase_briefs
         WHERE league_id = ? AND season = ? AND week = ? AND phase = ?
         ORDER BY version DESC`,
      )
      .all(
        key.leagueId,
        key.season,
        key.week,
        key.phase,
      ) as WeeklyPhaseBriefRow[];
    return rows.map(toWeeklyPhaseBrief);
  }

  getCurrentWeeklyBriefs(key: LeagueWeekKey): CurrentWeeklyBriefs {
    return {
      ...EMPTY_CURRENT_WEEKLY_BRIEFS,
      wednesday: this.getCurrentWeeklyPhaseBrief({
        ...key,
        phase: "wednesday",
      }),
      thursday: this.getCurrentWeeklyPhaseBrief({
        ...key,
        phase: "thursday",
      }),
      weekend: this.getCurrentWeeklyPhaseBrief({
        ...key,
        phase: "weekend",
      }),
    };
  }

  saveWeeklyPlanSummary(planId: string, input: WeeklyPlanSummary): WeeklyPlan {
    const existingPlan = this.getWeeklyPlan(planId);
    if (!existingPlan) throw new Error("Weekly plan not found");
    const editorial = WeeklyPlanSummarySchema.pick({
      headline: true,
      summary: true,
    }).parse(input);
    const summary = WeeklyPlanSummarySchema.parse(
      deriveWeeklyPlanSummary(existingPlan.output, editorial),
    );
    const result = this.database
      .prepare(
        "UPDATE weekly_plan_versions SET micro_summary_json = ? WHERE id = ?",
      )
      .run(JSON.stringify(summary), planId);
    if (result.changes !== 1) throw new Error("Weekly plan not found");
    const plan = this.getWeeklyPlan(planId);
    if (!plan) throw new Error("Failed to reload weekly plan");
    return plan;
  }

  setWeeklyPlanStatus(
    planId: string,
    status: WeeklyPlan["status"],
    reason: string | null,
  ): WeeklyPlan {
    const plan = this.getWeeklyPlan(planId);
    if (!plan) throw new Error("Weekly plan not found");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `UPDATE weekly_plan_versions
           SET lifecycle_status = ?, status_reason = ? WHERE id = ?`,
        )
        .run(status, reason, planId);
      this.database
        .prepare(
          `UPDATE league_weeks SET plan_status = ?, updated_at = ?
           WHERE current_plan_id = ?`,
        )
        .run(status, new Date().toISOString(), planId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.getWeeklyPlan(planId) ?? plan;
  }

  getWeeklyPlanBundle(key: LeagueWeekKey): WeeklyPlanBundle | null {
    const leagueWeek = this.getLeagueWeek(key);
    if (!leagueWeek) return null;
    const plan = this.getCurrentWeeklyPlan(key);
    return {
      leagueWeek,
      plan,
      actions: plan ? this.listWeeklyActions(plan.id) : [],
    };
  }

  listWeeklyActions(planId: string): WeeklyAction[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM weekly_actions WHERE plan_id = ?
         ORDER BY CASE priority WHEN 'now' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END,
                  created_at ASC`,
      )
      .all(planId) as WeeklyActionRow[];
    return rows.map(toWeeklyAction);
  }

  listWeeklyActionsForWeek(key: LeagueWeekKey): WeeklyAction[] {
    const rows = this.database
      .prepare(
        `SELECT action.* FROM weekly_actions action
         JOIN weekly_plan_versions plan ON plan.id = action.plan_id
         WHERE action.league_id = ? AND action.season = ? AND action.week = ?
         ORDER BY plan.version DESC, action.created_at ASC`,
      )
      .all(key.leagueId, key.season, key.week) as WeeklyActionRow[];
    return rows.map(toWeeklyAction);
  }

  updateWeeklyAction(
    actionId: string,
    status: WeeklyActionStatus,
    note: string | null = null,
    observedEventId: string | null = null,
  ): WeeklyAction {
    const current = this.getWeeklyAction(actionId);
    if (!current) throw new Error("Weekly action not found");
    if (
      current.status !== status &&
      !ACTION_TRANSITIONS[current.status].includes(status)
    )
      throw new Error(
        `Cannot move weekly action from ${current.status} to ${status}`,
      );
    const now = new Date().toISOString();
    const resolvedAt = isResolvedActionStatus(status) ? now : null;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          `UPDATE weekly_actions SET status = ?, disposition_note = ?,
             observed_event_id = ?, updated_at = ?, resolved_at = ?
           WHERE id = ?`,
        )
        .run(status, note, observedEventId, now, resolvedAt, actionId);
      this.database
        .prepare(
          `UPDATE league_weeks SET updated_at = ?
           WHERE league_id = ? AND season = ? AND week = ?`,
        )
        .run(now, current.leagueId, current.season, current.week);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    const saved = this.getWeeklyAction(actionId);
    if (!saved) throw new Error("Failed to reload weekly action");
    return saved;
  }

  getWeeklyAction(actionId: string): WeeklyAction | null {
    const row = this.database
      .prepare("SELECT * FROM weekly_actions WHERE id = ?")
      .get(actionId) as WeeklyActionRow | undefined;
    return row ? toWeeklyAction(row) : null;
  }

  saveSleeperEvents(inputs: SleeperEvent[]): number {
    const events = inputs.map((event) => SleeperEventSchema.parse(event));
    const statement = this.database.prepare(
      `INSERT INTO sleeper_events (
         id, league_id, season, week, dedupe_key, event_type, upstream_id,
         occurred_at, detected_at, roster_ids_json, player_ids_json, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(league_id, dedupe_key) DO NOTHING`,
    );
    let inserted = 0;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const event of events)
        inserted += Number(
          statement.run(
            event.id,
            event.leagueId,
            event.season,
            event.week,
            event.dedupeKey,
            event.eventType,
            event.upstreamId,
            event.occurredAt,
            event.detectedAt,
            JSON.stringify(event.rosterIds),
            JSON.stringify(event.playerIds),
            JSON.stringify(event.payload),
          ).changes,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return inserted;
  }

  listSleeperEvents(key: LeagueWeekKey): SleeperEvent[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM sleeper_events
         WHERE league_id = ? AND season = ? AND week = ?
         ORDER BY occurred_at DESC, id DESC`,
      )
      .all(key.leagueId, key.season, key.week) as Array<{
      id: string;
      league_id: string;
      season: string;
      week: number;
      dedupe_key: string;
      event_type: SleeperEvent["eventType"];
      upstream_id: string | null;
      occurred_at: string;
      detected_at: string;
      roster_ids_json: string;
      player_ids_json: string;
      payload_json: string;
    }>;
    return rows.map((row) =>
      SleeperEventSchema.parse({
        id: row.id,
        leagueId: row.league_id,
        season: row.season,
        week: row.week,
        dedupeKey: row.dedupe_key,
        eventType: row.event_type,
        upstreamId: row.upstream_id,
        occurredAt: row.occurred_at,
        detectedAt: row.detected_at,
        rosterIds: JSON.parse(row.roster_ids_json) as unknown,
        playerIds: JSON.parse(row.player_ids_json) as unknown,
        payload: JSON.parse(row.payload_json) as unknown,
      }),
    );
  }

  upsertWatchlistEntry(input: WatchlistEntry): WatchlistEntry {
    const entry = WatchlistEntrySchema.parse(input);
    this.database
      .prepare(
        `INSERT INTO watchlist_entries (
           id, league_id, player_id, hypothesis, trigger_text, state,
           created_season, created_week, expires_season, expires_week,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           hypothesis = excluded.hypothesis, trigger_text = excluded.trigger_text,
           state = excluded.state, expires_season = excluded.expires_season,
           expires_week = excluded.expires_week, updated_at = excluded.updated_at`,
      )
      .run(
        entry.id,
        entry.leagueId,
        entry.playerId,
        entry.hypothesis,
        entry.trigger,
        entry.state,
        entry.createdSeason,
        entry.createdWeek,
        entry.expiresSeason,
        entry.expiresWeek,
        entry.createdAt,
        entry.updatedAt,
      );
    return entry;
  }

  upsertGeneratedWatchlistEntry(input: WatchlistEntry): WatchlistEntry {
    const generated = WatchlistEntrySchema.parse(input);
    const existing = this.listWatchlistEntries(generated.leagueId, {
      includeInactive: true,
    }).filter((entry) => entry.playerId === generated.playerId);
    const protectedEntry = existing.find(
      (entry) => entry.state === "dismissed" || entry.state === "expired",
    );
    if (protectedEntry) return protectedEntry;

    const current = existing[0];
    return this.upsertWatchlistEntry(
      current
        ? {
            ...generated,
            id: current.id,
            state:
              current.state === "active" || current.state === "triggered"
                ? current.state
                : "active",
            createdSeason: current.createdSeason,
            createdWeek: current.createdWeek,
            createdAt: current.createdAt,
          }
        : generated,
    );
  }

  updateWatchlistState(
    entryId: string,
    state: WatchlistEntry["state"],
  ): WatchlistEntry {
    const row = this.database
      .prepare("SELECT league_id FROM watchlist_entries WHERE id = ?")
      .get(entryId) as { league_id: string } | undefined;
    if (!row) throw new Error("Watchlist entry not found");
    const now = new Date().toISOString();
    this.database
      .prepare(
        "UPDATE watchlist_entries SET state = ?, updated_at = ? WHERE id = ?",
      )
      .run(state, now, entryId);
    const saved = this.listWatchlistEntries(row.league_id, {
      includeInactive: true,
    }).find((entry) => entry.id === entryId);
    if (!saved) throw new Error("Failed to reload watchlist entry");
    return saved;
  }

  listWatchlistEntries(
    leagueId: string,
    options: { includeInactive?: boolean } = {},
  ): WatchlistEntry[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM watchlist_entries WHERE league_id = ?
         ${options.includeInactive ? "" : "AND state IN ('active', 'triggered')"}
         ORDER BY updated_at DESC, id ASC`,
      )
      .all(leagueId) as Array<{
      id: string;
      league_id: string;
      player_id: string;
      hypothesis: string;
      trigger_text: string;
      state: WatchlistEntry["state"];
      created_season: string;
      created_week: number;
      expires_season: string | null;
      expires_week: number | null;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) =>
      WatchlistEntrySchema.parse({
        id: row.id,
        leagueId: row.league_id,
        playerId: row.player_id,
        hypothesis: row.hypothesis,
        trigger: row.trigger_text,
        state: row.state,
        createdSeason: row.created_season,
        createdWeek: row.created_week,
        expiresSeason: row.expires_season,
        expiresWeek: row.expires_week,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    );
  }

  saveEvidenceClaims(inputs: EvidenceClaim[]): void {
    const claims = inputs.map((claim) => EvidenceClaimSchema.parse(claim));
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.upsertEvidenceClaims(claims);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listEvidenceClaims(input: {
    leagueId?: string | null;
    playerId?: string | null;
    freshAt?: string | null;
  }): EvidenceClaim[] {
    const clauses: string[] = [];
    const values: Array<string | null> = [];
    if (input.leagueId !== undefined) {
      clauses.push("league_id IS ?");
      values.push(input.leagueId);
    }
    if (input.playerId !== undefined) {
      clauses.push("player_id IS ?");
      values.push(input.playerId);
    }
    if (input.freshAt) {
      clauses.push("(expires_at IS NULL OR expires_at > ?)");
      values.push(input.freshAt);
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM evidence_claims
         ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
         ORDER BY fetched_at DESC, id ASC`,
      )
      .all(...values) as Array<{
      id: string;
      league_id: string | null;
      player_id: string | null;
      category: EvidenceClaim["category"];
      claim: string;
      metric_name: string | null;
      metric_value: number | null;
      source_title: string;
      source_url: string | null;
      source_type: EvidenceClaim["sourceType"];
      fetched_at: string;
      effective_week: number | null;
      expires_at: string | null;
    }>;
    return rows.map((row) =>
      EvidenceClaimSchema.parse({
        id: row.id,
        leagueId: row.league_id,
        playerId: row.player_id,
        category: row.category,
        claim: row.claim,
        metricName: row.metric_name,
        metricValue: row.metric_value,
        sourceTitle: row.source_title,
        sourceUrl: row.source_url,
        sourceType: row.source_type,
        fetchedAt: row.fetched_at,
        effectiveWeek: row.effective_week,
        expiresAt: row.expires_at,
      }),
    );
  }

  upsertProviderIdentity(input: ProviderIdentity): ProviderIdentity {
    const identity = ProviderIdentitySchema.parse(input);
    this.database
      .prepare(
        `INSERT INTO provider_identities (
           player_id, provider, provider_player_id, updated_at
         ) VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id, provider) DO UPDATE SET
           provider_player_id = excluded.provider_player_id,
           updated_at = excluded.updated_at`,
      )
      .run(
        identity.playerId,
        identity.provider,
        identity.providerPlayerId,
        identity.updatedAt,
      );
    return identity;
  }

  getProviderIdentity(
    playerId: string,
    provider: string,
  ): ProviderIdentity | null {
    const row = this.database
      .prepare(
        `SELECT player_id, provider, provider_player_id, updated_at
         FROM provider_identities WHERE player_id = ? AND provider = ?`,
      )
      .get(playerId, provider) as
      | {
          player_id: string;
          provider: string;
          provider_player_id: string;
          updated_at: string;
        }
      | undefined;
    return row
      ? ProviderIdentitySchema.parse({
          playerId: row.player_id,
          provider: row.provider,
          providerPlayerId: row.provider_player_id,
          updatedAt: row.updated_at,
        })
      : null;
  }

  getReports(leagueId: string): AiReport[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM ai_reports WHERE league_id = ? ORDER BY generated_at DESC",
      )
      .all(leagueId) as Array<{
      id: string;
      league_id: string;
      kind: ReportKind;
      generated_at: string;
      snapshot_at: string;
      invalidated: number;
      payload_json: string;
      micro_summary_json: string | null;
      draft_plan_json: string | null;
    }>;
    return rows.map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      kind: row.kind,
      generatedAt: row.generated_at,
      snapshotAt: row.snapshot_at,
      invalidated: row.invalidated === 1,
      payload: JSON.parse(row.payload_json) as ReportPayload,
      microSummary: row.micro_summary_json
        ? MicroSummarySchema.parse(JSON.parse(row.micro_summary_json))
        : null,
      draftPlan: row.draft_plan_json
        ? DraftPlanSchema.parse(JSON.parse(row.draft_plan_json))
        : null,
    }));
  }

  saveReport(input: {
    leagueId: string;
    kind: ReportKind;
    snapshotAt: string;
    payload: ReportPayload;
    draftPlan?: DraftPlan | null;
  }): AiReport {
    const report: AiReport = {
      id: randomUUID(),
      leagueId: input.leagueId,
      kind: input.kind,
      generatedAt: new Date().toISOString(),
      snapshotAt: input.snapshotAt,
      invalidated: false,
      payload: input.payload,
      microSummary: null,
      draftPlan: input.draftPlan ?? null,
    };
    this.database
      .prepare(
        "INSERT INTO ai_reports (id, league_id, kind, generated_at, snapshot_at, invalidated, payload_json, draft_plan_json) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
      )
      .run(
        report.id,
        report.leagueId,
        report.kind,
        report.generatedAt,
        report.snapshotAt,
        JSON.stringify(report.payload),
        report.draftPlan ? JSON.stringify(report.draftPlan) : null,
      );
    return report;
  }

  saveMicroSummary(report: AiReport, input: MicroSummary): AiReport {
    const microSummary = MicroSummarySchema.parse(input);
    this.database
      .prepare("UPDATE ai_reports SET micro_summary_json = ? WHERE id = ?")
      .run(JSON.stringify(microSummary), report.id);
    return { ...report, microSummary };
  }

  getThread(leagueId: string, purpose: string): string | null {
    const row = this.database
      .prepare(
        "SELECT thread_id FROM codex_threads WHERE league_id = ? AND purpose = ?",
      )
      .get(leagueId, purpose) as { thread_id: string } | undefined;
    return row?.thread_id ?? null;
  }

  saveThread(leagueId: string, purpose: string, threadId: string): void {
    this.database
      .prepare(
        `INSERT INTO codex_threads (league_id, purpose, thread_id) VALUES (?, ?, ?)
         ON CONFLICT(league_id, purpose) DO UPDATE SET thread_id = excluded.thread_id`,
      )
      .run(leagueId, purpose, threadId);
  }

  getAiSettings(): AiSettings {
    const rows = this.database
      .prepare("SELECT key, value FROM app_settings WHERE key IN (?, ?)")
      .all("ai_model", "ai_effort") as Array<{
      key: string;
      value: string;
    }>;
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const parsed = AiSettingsSchema.safeParse({
      model: values["ai_model"] ?? DEFAULT_AI_SETTINGS.model,
      effort: values["ai_effort"] ?? DEFAULT_AI_SETTINGS.effort,
    });
    return parsed.success ? parsed.data : { ...DEFAULT_AI_SETTINGS };
  }

  saveAiSettings(settings: AiSettings): void {
    const statement = this.database.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    this.database.exec("BEGIN IMMEDIATE");
    try {
      statement.run("ai_model", settings.model);
      statement.run("ai_effort", settings.effort);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  listChatMessages(
    leagueId: string,
    options: { limit?: number; before?: ChatHistoryCursor | null } = {},
  ): ChatHistoryPage {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const before = options.before ?? null;
    const rows = (
      before
        ? this.database
            .prepare(
              `SELECT * FROM chat_messages
             WHERE league_id = ?
               AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            )
            .all(
              leagueId,
              before.createdAt,
              before.createdAt,
              before.id,
              limit + 1,
            )
        : this.database
            .prepare(
              `SELECT * FROM chat_messages
             WHERE league_id = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
            )
            .all(leagueId, limit + 1)
    ) as Array<{
      id: string;
      league_id: string;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>;
    return {
      hasMore: rows.length > limit,
      messages: rows
        .slice(0, limit)
        .reverse()
        .map((row) => ({
          id: row.id,
          leagueId: row.league_id,
          role: row.role,
          content: row.content,
          createdAt: row.created_at,
        })),
    };
  }

  saveChatMessage(
    leagueId: string,
    role: "user" | "assistant",
    content: string,
  ): ChatMessage {
    const message: ChatMessage = {
      id: randomUUID(),
      leagueId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    this.database
      .prepare(
        "INSERT INTO chat_messages (id, league_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        message.id,
        message.leagueId,
        message.role,
        message.content,
        message.createdAt,
      );
    return message;
  }

  clearAll(): void {
    this.database.exec(
      `BEGIN;
       DELETE FROM provider_identities;
       DELETE FROM evidence_claims;
       DELETE FROM watchlist_entries;
       DELETE FROM sleeper_events;
       DELETE FROM weekly_actions;
       DELETE FROM weekly_phase_briefs;
       DELETE FROM weekly_plan_versions;
       DELETE FROM league_weeks;
       DELETE FROM chat_messages;
       DELETE FROM codex_threads;
       DELETE FROM ai_reports;
       DELETE FROM draft_candidate_pins;
       DELETE FROM league_snapshots;
       DELETE FROM leagues;
       COMMIT;`,
    );
  }

  close(): void {
    this.database.close();
  }

  private toLeagueWeek(row: LeagueWeekRow): LeagueWeek {
    const summary = row.current_plan_id
      ? (this.database
          .prepare(
            `SELECT
               SUM(CASE WHEN status IN ('pending', 'observed_in_sleeper') THEN 1 ELSE 0 END) AS pending,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN status IN ('dismissed', 'declined', 'failed', 'not_possible', 'superseded') THEN 1 ELSE 0 END) AS dismissed
             FROM weekly_actions WHERE plan_id = ?`,
          )
          .get(row.current_plan_id) as {
          pending: number | null;
          completed: number | null;
          dismissed: number | null;
        })
      : null;
    return LeagueWeekSchema.parse({
      leagueId: row.league_id,
      season: row.season,
      week: row.week,
      phase: row.phase,
      latestSnapshotAt: row.latest_snapshot_at,
      currentPlanId: row.current_plan_id,
      competitiveLane: row.competitive_lane,
      planStatus: row.plan_status,
      meaningfulChanges: JSON.parse(row.meaningful_changes_json) as unknown,
      actionSummary: {
        pending: summary?.pending ?? 0,
        completed: summary?.completed ?? 0,
        dismissed: summary?.dismissed ?? 0,
      },
      updatedAt: row.updated_at,
    });
  }

  private migrate(): void {
    const version = this.database.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    for (const migration of STORE_MIGRATIONS) {
      if (migration.version <= version.user_version) continue;
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(migration.sql);
        if (migration.version === 1) {
          this.ensureColumn("ai_reports", "micro_summary_json", "TEXT");
          this.ensureColumn("ai_reports", "draft_plan_json", "TEXT");
        }
        this.database.exec(`PRAGMA user_version = ${migration.version}`);
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
  }

  /**
   * Upsert evidence only when an existing identifier has the same owner.
   *
   * Weekly plan/brief evidence is scoped before it reaches this method, while
   * provider evidence may use a stable global identifier. Refusing an ownership
   * change keeps a reused provider/model identifier from silently moving a row
   * between leagues and retaining stale provenance columns.
   */
  private upsertEvidenceClaims(claims: EvidenceClaim[]): void {
    const ownership = new Map<string, string | null>();
    const existingStatement = this.database.prepare(
      "SELECT league_id FROM evidence_claims WHERE id = ?",
    );
    for (const claim of claims) {
      const requestOwner = ownership.get(claim.id);
      if (ownership.has(claim.id) && requestOwner !== claim.leagueId)
        throw new Error(
          `Evidence claim ${claim.id} cannot belong to multiple leagues`,
        );
      ownership.set(claim.id, claim.leagueId);
      const existing = existingStatement.get(claim.id) as
        | { league_id: string | null }
        | undefined;
      if (existing && existing.league_id !== claim.leagueId)
        throw new Error(
          `Evidence claim ${claim.id} already belongs to a different league`,
        );
    }

    const statement = this.database.prepare(
      `INSERT INTO evidence_claims (
         id, league_id, player_id, category, claim, metric_name, metric_value,
         source_title, source_url, source_type, fetched_at, effective_week, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         league_id = excluded.league_id, player_id = excluded.player_id,
         category = excluded.category, claim = excluded.claim,
         metric_name = excluded.metric_name, metric_value = excluded.metric_value,
         source_title = excluded.source_title, source_url = excluded.source_url,
         source_type = excluded.source_type, fetched_at = excluded.fetched_at,
         effective_week = excluded.effective_week, expires_at = excluded.expires_at`,
    );
    for (const claim of claims)
      statement.run(
        claim.id,
        claim.leagueId,
        claim.playerId,
        claim.category,
        claim.claim,
        claim.metricName,
        claim.metricValue,
        claim.sourceTitle,
        claim.sourceUrl,
        claim.sourceType,
        claim.fetchedAt,
        claim.effectiveWeek,
        claim.expiresAt,
      );
  }

  private ensureColumn(
    table: string,
    column: string,
    definition: string,
  ): void {
    const columns = this.database
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }> | undefined;
    if (!columns?.some((candidate) => candidate.name === column))
      this.database.exec(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      );
  }
}

type WeeklyEvidenceScope = {
  kind: "plan" | "brief";
  id: string;
  leagueId: string;
};

function scopeEvidenceClaims(
  claims: EvidenceClaim[],
  scope: WeeklyEvidenceScope,
): EvidenceClaim[] {
  return claims.map((claim) => {
    if (claim.leagueId !== scope.leagueId)
      throw new Error(
        `Evidence claim ${claim.id} does not belong to ${scope.kind} ${scope.id}`,
      );
    return {
      ...claim,
      id: [
        "weekly-evidence:v1",
        encodeURIComponent(scope.leagueId),
        scope.kind,
        encodeURIComponent(scope.id),
        encodeURIComponent(claim.id),
      ].join(":"),
    };
  });
}

function toSavedLeague(row: LeagueRow): SavedLeague {
  return {
    leagueId: row.league_id,
    name: row.name,
    season: row.season,
    rosterId: row.roster_id,
    userId: row.user_id,
    teamName: row.team_name,
    avatar: row.avatar,
    lastRefreshedAt: row.last_refreshed_at,
    isActive: row.is_active === 1,
  };
}

function toWeeklyPlan(row: WeeklyPlanRow): WeeklyPlan {
  return WeeklyPlanSchema.parse({
    id: row.id,
    leagueId: row.league_id,
    season: row.season,
    week: row.week,
    version: row.version,
    sourceSnapshotId: row.source_snapshot_id,
    inputHash: row.input_hash,
    evidenceHash: row.evidence_hash,
    generatedAt: row.generated_at,
    researchFreshThrough: row.research_fresh_through,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    status: row.lifecycle_status,
    statusReason: row.status_reason,
    output: JSON.parse(row.output_json) as unknown,
    players: JSON.parse(row.players_json) as unknown,
    rosters: JSON.parse(row.rosters_json) as unknown,
    microSummary: row.micro_summary_json
      ? (JSON.parse(row.micro_summary_json) as unknown)
      : null,
  });
}

function toWeeklyPhaseBrief(row: WeeklyPhaseBriefRow): WeeklyPhaseBrief {
  return WeeklyPhaseBriefSchema.parse({
    id: row.id,
    leagueId: row.league_id,
    season: row.season,
    week: row.week,
    phase: row.phase,
    version: row.version,
    sourceSnapshotId: row.source_snapshot_id,
    sourcePlanId: row.source_plan_id,
    inputHash: row.input_hash,
    evidenceHash: row.evidence_hash,
    generatedAt: row.generated_at,
    dataFreshThrough: row.data_fresh_through,
    researchFreshThrough: row.research_fresh_through,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    promptVersion: row.prompt_version,
    schemaVersion: row.schema_version,
    output: JSON.parse(row.output_json) as unknown,
    players: JSON.parse(row.players_json) as unknown,
  });
}

function toWeeklyAction(row: WeeklyActionRow): WeeklyAction {
  return WeeklyActionSchema.parse({
    id: row.id,
    planId: row.plan_id,
    leagueId: row.league_id,
    season: row.season,
    week: row.week,
    actionKey: row.action_key,
    kind: row.kind,
    status: row.status,
    title: row.title,
    description: row.description,
    priority: row.priority,
    playerIds: JSON.parse(row.player_ids_json) as unknown,
    rosterIds: JSON.parse(row.roster_ids_json) as unknown,
    dispositionNote: row.disposition_note,
    observedEventId: row.observed_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  });
}

const ACTION_TRANSITIONS: Record<WeeklyActionStatus, WeeklyActionStatus[]> = {
  pending: [
    "completed",
    "dismissed",
    "declined",
    "failed",
    "not_possible",
    "observed_in_sleeper",
    "superseded",
  ],
  observed_in_sleeper: [
    "pending",
    "completed",
    "dismissed",
    "not_possible",
    "superseded",
  ],
  completed: ["pending", "superseded"],
  dismissed: ["pending", "superseded"],
  declined: ["pending", "superseded"],
  failed: ["pending", "superseded"],
  not_possible: ["pending", "superseded"],
  superseded: [],
};

function isResolvedActionStatus(status: WeeklyActionStatus): boolean {
  return !["pending", "observed_in_sleeper"].includes(status);
}
