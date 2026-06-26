-- ─────────────────────────────────────────────────────────
-- Look Ahead Planner — Complete Database Schema
-- Assignment 2: Multi-user, Role-based
-- ─────────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor to set up the database.
-- ─────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────
-- SECTION 1: USER MANAGEMENT
-- ─────────────────────────────────────────────────────────

-- Profiles (extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  global_role   TEXT        NOT NULL DEFAULT 'viewer',
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Unknown'),
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────
-- SECTION 2: PROJECTS
-- ─────────────────────────────────────────────────────────

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  code        TEXT        NOT NULL UNIQUE,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);

-- Project members (links users to projects with role)
CREATE TABLE IF NOT EXISTS project_members (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role              TEXT        NOT NULL DEFAULT 'viewer',
  is_active_session BOOLEAN     DEFAULT false,
  joined_at         TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (project_id, user_id)
);

-- Viewer assignments (links viewers to their site engineer)
CREATE TABLE IF NOT EXISTS viewer_assignments (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  viewer_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  engineer_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_active     BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (viewer_id, project_id)
);

-- Deactivate viewers when engineer loses active session
CREATE OR REPLACE FUNCTION deactivate_viewer_assignments()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE viewer_assignments
  SET is_active = false
  WHERE engineer_id = OLD.user_id
  AND project_id = OLD.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_engineer_deactivated
  AFTER UPDATE ON project_members
  FOR EACH ROW
  WHEN (OLD.is_active_session = true AND NEW.is_active_session = false)
  EXECUTE FUNCTION deactivate_viewer_assignments();

-- User ID sequences (for generating BSL-ENG-0001 style IDs)
CREATE TABLE IF NOT EXISTS user_id_sequences (
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL,
  last_sequence INTEGER     DEFAULT 0,
  PRIMARY KEY (project_id, role)
);


-- ─────────────────────────────────────────────────────────
-- SECTION 3: ACTIVITIES
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activities (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id          UUID        REFERENCES projects(id) ON DELETE CASCADE,
  activity_id         TEXT        NOT NULL,
  activity_name       TEXT        NOT NULL,
  assigned_to         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  wbs_code            TEXT,
  status              TEXT        DEFAULT 'Not Started',
  progress            INTEGER     DEFAULT 0,
  start_date          DATE,
  finish_date         DATE,
  duration            INTEGER,
  act_start_date      DATE,
  act_end_date        DATE,
  act_duration        NUMERIC,
  delay_days          INTEGER,
  is_baseline         BOOLEAN     DEFAULT false,
  responsible_engineer TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (project_id, activity_id)
);

-- Activity progress history (audit trail)
CREATE TABLE IF NOT EXISTS activity_history (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  activity_id   TEXT        NOT NULL,
  project_id    UUID        REFERENCES projects(id) ON DELETE CASCADE,
  changed_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  progress_from INTEGER,
  progress_to   INTEGER,
  status_from   TEXT,
  status_to     TEXT,
  changed_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);


-- ─────────────────────────────────────────────────────────
-- SECTION 4: CONSTRAINTS
-- ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS constraints (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id           UUID        REFERENCES projects(id) ON DELETE CASCADE,
  activity_id          TEXT,
  assigned_to          UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  constraint_type      TEXT        NOT NULL,
  description          TEXT,
  status               TEXT        DEFAULT 'Open',
  target_removal_date  DATE,
  due_date             DATE,
  raised_by            TEXT,
  remarks              TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_constraints_activity
    FOREIGN KEY (activity_id)
    REFERENCES activities(activity_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);


-- ─────────────────────────────────────────────────────────
-- SECTION 5: PLANNING SESSIONS AND WEEKLY COMMITMENTS
-- ─────────────────────────────────────────────────────────

-- Planning sessions (14-day or weekly windows)
CREATE TABLE IF NOT EXISTS planning_sessions (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id    UUID        REFERENCES projects(id) ON DELETE CASCADE,
  created_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  start_date    DATE        NOT NULL,
  end_date      DATE        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'active',
  ppc_score     NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  PRIMARY KEY (id)
);

-- Weekly commitments per session per engineer
CREATE TABLE IF NOT EXISTS weekly_commitments (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  project_id      UUID        REFERENCES projects(id) ON DELETE CASCADE,
  session_id      UUID        REFERENCES planning_sessions(id) ON DELETE CASCADE,
  activity_id     TEXT        NOT NULL,
  assigned_to     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  week_start      DATE,
  committed       BOOLEAN     DEFAULT false,
  done            BOOLEAN     DEFAULT false,
  variance_reason TEXT,
  created_by      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (session_id, activity_id)
);

-- Session activities (committed activities per session)
CREATE TABLE IF NOT EXISTS session_activities (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  activity_id     TEXT        NOT NULL,
  assigned_to     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  was_completed   BOOLEAN     DEFAULT false,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (session_id, activity_id)
);

-- Daily logs per session
CREATE TABLE IF NOT EXISTS session_daily_logs (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES planning_sessions(id) ON DELETE CASCADE,
  log_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT        NOT NULL,
  logged_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id)
);


-- ─────────────────────────────────────────────────────────
-- SECTION 6: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_id_sequences  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE constraints        ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_daily_logs ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──────────────────────────────────────────────
CREATE POLICY "users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "admin full access to profiles"
  ON profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- ── PROJECTS ──────────────────────────────────────────────
CREATE POLICY "members can view their projects"
  ON projects FOR SELECT
  USING (
    id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "admin full access to projects"
  ON projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- ── PROJECT MEMBERS ───────────────────────────────────────
CREATE POLICY "members can view project members"
  ON project_members FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM project_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "planner can manage engineers in project"
  ON project_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
      AND pm.project_id = project_members.project_id
      AND pm.role = 'planner'
    )
    AND project_members.role IN ('site_engineer', 'viewer')
  );

CREATE POLICY "planner can update members in project"
  ON project_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
      AND pm.project_id = project_members.project_id
      AND pm.role = 'planner'
    )
    AND project_members.role IN ('site_engineer', 'viewer')
  );

CREATE POLICY "admin full access to project members"
  ON project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- ── VIEWER ASSIGNMENTS ────────────────────────────────────
CREATE POLICY "engineers can view their viewers"
  ON viewer_assignments FOR SELECT
  USING (engineer_id = auth.uid());

CREATE POLICY "viewers can see own assignment"
  ON viewer_assignments FOR SELECT
  USING (viewer_id = auth.uid());

CREATE POLICY "engineers can assign viewers"
  ON viewer_assignments FOR INSERT
  WITH CHECK (engineer_id = auth.uid());

CREATE POLICY "planner full access to viewer assignments"
  ON viewer_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = viewer_assignments.project_id
      AND role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = viewer_assignments.project_id
      AND role = 'planner'
    )
  );

CREATE POLICY "admin full access to viewer assignments"
  ON viewer_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- ── ACTIVITIES ────────────────────────────────────────────
-- Admin: full access
CREATE POLICY "admin full access to activities"
  ON activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner: full access within their project
CREATE POLICY "planner full access to activities"
  ON activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = activities.project_id
      AND role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = activities.project_id
      AND role = 'planner'
    )
  );

-- Site Engineer: read + update own assigned activities only
CREATE POLICY "engineer can read own activities"
  ON activities FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "engineer can update own activities"
  ON activities FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Viewer: read only, activities assigned to their engineer
CREATE POLICY "viewer can read engineer activities"
  ON activities FOR SELECT
  USING (
    assigned_to IN (
      SELECT engineer_id FROM viewer_assignments
      WHERE viewer_id = auth.uid()
      AND is_active = true
    )
  );

-- ── CONSTRAINTS ───────────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to constraints"
  ON constraints FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner full access within project
CREATE POLICY "planner full access to constraints"
  ON constraints FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = constraints.project_id
      AND role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = constraints.project_id
      AND role = 'planner'
    )
  );

-- Site Engineer: manage constraints on own activities only
CREATE POLICY "engineer can manage own constraints"
  ON constraints FOR ALL
  USING (
    activity_id IN (
      SELECT activity_id FROM activities
      WHERE assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    activity_id IN (
      SELECT activity_id FROM activities
      WHERE assigned_to = auth.uid()
    )
  );

-- Viewer: read only constraints on their engineer's activities
CREATE POLICY "viewer can read constraints"
  ON constraints FOR SELECT
  USING (
    activity_id IN (
      SELECT a.activity_id FROM activities a
      JOIN viewer_assignments va ON va.engineer_id = a.assigned_to
      WHERE va.viewer_id = auth.uid()
      AND va.is_active = true
    )
  );

-- ── PLANNING SESSIONS ─────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to planning sessions"
  ON planning_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner full access within project
CREATE POLICY "planner full access to planning sessions"
  ON planning_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = planning_sessions.project_id
      AND role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = planning_sessions.project_id
      AND role = 'planner'
    )
  );

-- Site Engineer: read own sessions only
CREATE POLICY "engineer can read own sessions"
  ON planning_sessions FOR SELECT
  USING (
    id IN (
      SELECT session_id FROM session_activities
      WHERE assigned_to = auth.uid()
    )
  );

-- Viewer: read only
CREATE POLICY "viewer can read sessions"
  ON planning_sessions FOR SELECT
  USING (
    id IN (
      SELECT sa.session_id FROM session_activities sa
      JOIN viewer_assignments va ON va.engineer_id = sa.assigned_to
      WHERE va.viewer_id = auth.uid()
      AND va.is_active = true
    )
  );

-- ── WEEKLY COMMITMENTS ────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to weekly commitments"
  ON weekly_commitments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner full access within project
CREATE POLICY "planner full access to weekly commitments"
  ON weekly_commitments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = weekly_commitments.project_id
      AND role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = weekly_commitments.project_id
      AND role = 'planner'
    )
  );

-- Site Engineer: read + update own committed activities
CREATE POLICY "engineer can manage own commitments"
  ON weekly_commitments FOR ALL
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Viewer: read only their engineer's commitments
CREATE POLICY "viewer can read commitments"
  ON weekly_commitments FOR SELECT
  USING (
    assigned_to IN (
      SELECT engineer_id FROM viewer_assignments
      WHERE viewer_id = auth.uid()
      AND is_active = true
    )
  );

-- ── SESSION ACTIVITIES ────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to session activities"
  ON session_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner full access
CREATE POLICY "planner full access to session activities"
  ON session_activities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM planning_sessions ps
      JOIN project_members pm ON pm.project_id = ps.project_id
      WHERE ps.id = session_activities.session_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_sessions ps
      JOIN project_members pm ON pm.project_id = ps.project_id
      WHERE ps.id = session_activities.session_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'planner'
    )
  );

-- Engineer: read + update own assigned session activities
CREATE POLICY "engineer can manage own session activities"
  ON session_activities FOR ALL
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Viewer: read only
CREATE POLICY "viewer can read session activities"
  ON session_activities FOR SELECT
  USING (
    assigned_to IN (
      SELECT engineer_id FROM viewer_assignments
      WHERE viewer_id = auth.uid()
      AND is_active = true
    )
  );

-- ── SESSION DAILY LOGS ────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to daily logs"
  ON session_daily_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner full access
CREATE POLICY "planner full access to daily logs"
  ON session_daily_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM planning_sessions ps
      JOIN project_members pm ON pm.project_id = ps.project_id
      WHERE ps.id = session_daily_logs.session_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'planner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM planning_sessions ps
      JOIN project_members pm ON pm.project_id = ps.project_id
      WHERE ps.id = session_daily_logs.session_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'planner'
    )
  );

-- Engineer: read + add logs for own sessions
CREATE POLICY "engineer can manage own daily logs"
  ON session_daily_logs FOR ALL
  USING (logged_by = auth.uid())
  WITH CHECK (logged_by = auth.uid());

-- Viewer: read only
CREATE POLICY "viewer can read daily logs"
  ON session_daily_logs FOR SELECT
  USING (
    session_id IN (
      SELECT sa.session_id FROM session_activities sa
      JOIN viewer_assignments va ON va.engineer_id = sa.assigned_to
      WHERE va.viewer_id = auth.uid()
      AND va.is_active = true
    )
  );

-- ── ACTIVITY HISTORY ──────────────────────────────────────
-- Admin full access
CREATE POLICY "admin full access to activity history"
  ON activity_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND global_role = 'admin'
    )
  );

-- Planner can read all history in their project
CREATE POLICY "planner can read activity history"
  ON activity_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = activity_history.project_id
      AND role = 'planner'
    )
  );

-- Engineer can read + insert history for own activities
CREATE POLICY "engineer can manage own history"
  ON activity_history FOR ALL
  USING (changed_by = auth.uid())
  WITH CHECK (changed_by = auth.uid());

-- ── USER ID SEQUENCES ─────────────────────────────────────
CREATE POLICY "admin and planner can manage sequences"
  ON user_id_sequences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = user_id_sequences.project_id
      AND role IN ('admin', 'planner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE user_id = auth.uid()
      AND project_id = user_id_sequences.project_id
      AND role IN ('admin', 'planner')
    )
  );