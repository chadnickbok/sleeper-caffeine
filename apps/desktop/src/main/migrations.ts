export type StoreMigration = {
  version: number;
  sql: string;
};

/**
 * Append-only SQLite migrations. Never edit a migration after release; add a
 * new version so an existing desktop database follows the same path as a new
 * installation.
 */
export const STORE_MIGRATIONS: readonly StoreMigration[] = [
  {
    version: 1,
    sql: `
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
        invalidated INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL,
        micro_summary_json TEXT, draft_plan_json TEXT
      );
      CREATE TABLE IF NOT EXISTS codex_threads (
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        purpose TEXT NOT NULL, thread_id TEXT NOT NULL, PRIMARY KEY (league_id, purpose)
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS draft_candidate_pins (
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        player_id TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY (league_id, player_id)
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_league ON league_snapshots(league_id, captured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reports_league ON ai_reports(league_id, generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_league
        ON chat_messages(league_id, created_at DESC, id DESC);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE league_weeks (
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        season TEXT NOT NULL,
        week INTEGER NOT NULL,
        phase TEXT NOT NULL,
        latest_snapshot_at TEXT,
        latest_context_json TEXT,
        latest_context_hash TEXT,
        current_plan_id TEXT,
        competitive_lane TEXT,
        plan_status TEXT NOT NULL,
        meaningful_changes_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (league_id, season, week)
      );

      CREATE TABLE weekly_plan_versions (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        season TEXT NOT NULL,
        week INTEGER NOT NULL,
        version INTEGER NOT NULL,
        source_snapshot_id TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        research_fresh_through TEXT NOT NULL,
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        lifecycle_status TEXT NOT NULL,
        status_reason TEXT,
        output_json TEXT NOT NULL,
        players_json TEXT NOT NULL,
        rosters_json TEXT NOT NULL,
        micro_summary_json TEXT,
        FOREIGN KEY (league_id, season, week)
          REFERENCES league_weeks(league_id, season, week) ON DELETE CASCADE,
        UNIQUE (league_id, season, week, version)
      );

      CREATE TABLE weekly_actions (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES weekly_plan_versions(id) ON DELETE CASCADE,
        league_id TEXT NOT NULL,
        season TEXT NOT NULL,
        week INTEGER NOT NULL,
        action_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL,
        player_ids_json TEXT NOT NULL,
        roster_ids_json TEXT NOT NULL,
        disposition_note TEXT,
        observed_event_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT,
        UNIQUE (plan_id, action_key)
      );

      CREATE TABLE sleeper_events (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        season TEXT NOT NULL,
        week INTEGER NOT NULL,
        dedupe_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        upstream_id TEXT,
        occurred_at TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        roster_ids_json TEXT NOT NULL,
        player_ids_json TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        UNIQUE (league_id, dedupe_key)
      );

      CREATE TABLE watchlist_entries (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
        player_id TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        state TEXT NOT NULL,
        created_season TEXT NOT NULL,
        created_week INTEGER NOT NULL,
        expires_season TEXT,
        expires_week INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE evidence_claims (
        id TEXT PRIMARY KEY,
        league_id TEXT REFERENCES leagues(league_id) ON DELETE CASCADE,
        player_id TEXT,
        category TEXT NOT NULL,
        claim TEXT NOT NULL,
        metric_name TEXT,
        metric_value REAL,
        source_title TEXT NOT NULL,
        source_url TEXT,
        source_type TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        effective_week INTEGER,
        expires_at TEXT
      );

      CREATE TABLE provider_identities (
        player_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_player_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (player_id, provider),
        UNIQUE (provider, provider_player_id)
      );

      CREATE INDEX idx_league_weeks_updated
        ON league_weeks(league_id, season, week DESC);
      CREATE INDEX idx_weekly_plan_versions_week
        ON weekly_plan_versions(league_id, season, week, version DESC);
      CREATE INDEX idx_weekly_actions_plan
        ON weekly_actions(plan_id, status, created_at);
      CREATE INDEX idx_weekly_actions_week
        ON weekly_actions(league_id, season, week, status);
      CREATE INDEX idx_sleeper_events_week
        ON sleeper_events(league_id, season, week, occurred_at DESC);
      CREATE INDEX idx_watchlist_league
        ON watchlist_entries(league_id, state, updated_at DESC);
      CREATE INDEX idx_evidence_player
        ON evidence_claims(player_id, fetched_at DESC);
      CREATE INDEX idx_evidence_league
        ON evidence_claims(league_id, fetched_at DESC);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE weekly_phase_briefs (
        id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        season TEXT NOT NULL,
        week INTEGER NOT NULL,
        phase TEXT NOT NULL,
        version INTEGER NOT NULL,
        source_snapshot_id TEXT NOT NULL,
        source_plan_id TEXT,
        input_hash TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        data_fresh_through TEXT NOT NULL,
        research_fresh_through TEXT NOT NULL,
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        schema_version TEXT NOT NULL,
        output_json TEXT NOT NULL,
        players_json TEXT NOT NULL,
        FOREIGN KEY (league_id, season, week)
          REFERENCES league_weeks(league_id, season, week) ON DELETE CASCADE,
        FOREIGN KEY (source_plan_id)
          REFERENCES weekly_plan_versions(id) ON DELETE SET NULL,
        UNIQUE (league_id, season, week, phase, version)
      );

      CREATE INDEX idx_weekly_phase_briefs_current
        ON weekly_phase_briefs(league_id, season, week, phase, version DESC);
      CREATE INDEX idx_weekly_phase_briefs_plan
        ON weekly_phase_briefs(source_plan_id, generated_at DESC);
    `,
  },
] as const;

export const STORE_SCHEMA_VERSION = STORE_MIGRATIONS.at(-1)?.version ?? 0;
