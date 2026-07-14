import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AiReport,
  ChatMessage,
  Dashboard,
  ReportKind,
  ReportPayload,
  SavedLeague,
  TeamChoice,
} from "@sleeper-caffeine/ipc-contract";

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
        .prepare("UPDATE ai_reports SET invalidated = 1 WHERE league_id = ?")
        .run(dashboard.league.leagueId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
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
    }>;
    return rows.map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      kind: row.kind,
      generatedAt: row.generated_at,
      snapshotAt: row.snapshot_at,
      invalidated: row.invalidated === 1,
      payload: JSON.parse(row.payload_json) as ReportPayload,
    }));
  }

  saveReport(input: {
    leagueId: string;
    kind: ReportKind;
    snapshotAt: string;
    payload: ReportPayload;
  }): AiReport {
    const report: AiReport = {
      id: randomUUID(),
      leagueId: input.leagueId,
      kind: input.kind,
      generatedAt: new Date().toISOString(),
      snapshotAt: input.snapshotAt,
      invalidated: false,
      payload: input.payload,
    };
    this.database
      .prepare(
        "INSERT INTO ai_reports (id, league_id, kind, generated_at, snapshot_at, invalidated, payload_json) VALUES (?, ?, ?, ?, ?, 0, ?)",
      )
      .run(
        report.id,
        report.leagueId,
        report.kind,
        report.generatedAt,
        report.snapshotAt,
        JSON.stringify(report.payload),
      );
    return report;
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

  listChatMessages(leagueId: string): ChatMessage[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM chat_messages WHERE league_id = ? ORDER BY created_at ASC",
      )
      .all(leagueId) as Array<{
      id: string;
      league_id: string;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    }));
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
      "BEGIN; DELETE FROM chat_messages; DELETE FROM codex_threads; DELETE FROM ai_reports; DELETE FROM league_snapshots; DELETE FROM leagues; COMMIT;",
    );
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS leagues (
        league_id TEXT PRIMARY KEY, name TEXT NOT NULL, season TEXT NOT NULL,
        roster_id INTEGER NOT NULL, user_id TEXT NOT NULL, team_name TEXT NOT NULL,
        avatar TEXT, last_refreshed_at TEXT, snapshot_json TEXT, is_active INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS league_snapshots (
        id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        captured_at TEXT NOT NULL, dashboard_json TEXT NOT NULL, raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_reports (
        id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        kind TEXT NOT NULL, generated_at TEXT NOT NULL, snapshot_at TEXT NOT NULL,
        invalidated INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS codex_threads (
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        purpose TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY (league_id, purpose)
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_league ON league_snapshots(league_id, captured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_league ON ai_reports(league_id, generated_at DESC);
    `);
  }
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
