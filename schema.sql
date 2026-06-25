-- ─────────────────────────────────────────
-- Look Ahead Planner — Database Schema
-- ─────────────────────────────────────────
-- Run this in Supabase SQL Editor to set up
-- the database from scratch.
-- ─────────────────────────────────────────

-- Activities table
CREATE TABLE IF NOT EXISTS activities (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  activity_id         TEXT          NOT NULL,
  activity_name       TEXT          NOT NULL,
  start_date          DATE,
  finish_date         DATE,
  duration            INTEGER,
  progress            INTEGER       DEFAULT 0,
  responsible_engineer TEXT,
  created_at          TIMESTAMP     DEFAULT now(),
  status              TEXT,
  wbs_code            TEXT,
  act_start_date      DATE,
  act_end_date        DATE,
  act_duration        NUMERIC,
  delay_days          INTEGER,
  is_baseline         BOOLEAN       DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (activity_id)
);

-- Constraints table
CREATE TABLE IF NOT EXISTS constraints (
  id                   UUID          NOT NULL DEFAULT gen_random_uuid(),
  activity_id          TEXT,
  constraint_type      TEXT          NOT NULL,
  description          TEXT,
  status               TEXT          DEFAULT 'Open',
  target_removal_date  DATE,
  raised_by            TEXT,
  remarks              TEXT,
  created_at           TIMESTAMP     DEFAULT now(),
  updated_at           TIMESTAMPTZ   DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_constraints_activity
    FOREIGN KEY (activity_id)
    REFERENCES activities(activity_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE constraints ENABLE ROW LEVEL SECURITY;

-- Temporary open policies (replace when auth is added)
CREATE POLICY "allow_all_activities" ON activities
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_constraints" ON constraints
  FOR ALL USING (true) WITH CHECK (true);

-- Planning sessions
CREATE TABLE IF NOT EXISTS planning_sessions (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  start_date  DATE          NOT NULL,
  end_date    DATE          NOT NULL,
  status      TEXT          NOT NULL DEFAULT 'active',
  ppc_score   NUMERIC,
  created_at  TIMESTAMPTZ   DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS session_activities (
  id             UUID          NOT NULL DEFAULT gen_random_uuid(),
  session_id     UUID          NOT NULL,
  activity_id    TEXT          NOT NULL,
  was_completed  BOOLEAN       DEFAULT false,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (session_id, activity_id),
  CONSTRAINT fk_session_activities_session
    FOREIGN KEY (session_id)
    REFERENCES planning_sessions(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_session_activities_activity
    FOREIGN KEY (activity_id)
    REFERENCES activities(activity_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_daily_logs (
  id          UUID          NOT NULL DEFAULT gen_random_uuid(),
  session_id  UUID          NOT NULL,
  log_date    DATE          NOT NULL,
  note        TEXT          NOT NULL,
  logged_by   TEXT,
  created_at  TIMESTAMPTZ   DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_session_daily_logs_session
    FOREIGN KEY (session_id)
    REFERENCES planning_sessions(id)
    ON DELETE CASCADE
);

ALTER TABLE planning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_planning_sessions" ON planning_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_session_activities" ON session_activities
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_session_daily_logs" ON session_daily_logs
  FOR ALL USING (true) WITH CHECK (true);