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