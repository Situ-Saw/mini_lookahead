# Look Ahead Planner

A multi-user, role-based construction look-ahead planning tool built on Lean construction principles. Designed for site teams to plan, track, and improve weekly work reliability using PPC (Percent Plan Complete).

Live: https://mini-lookahead.vercel.app
GitHub: https://github.com/Situ-Saw/mini_lookahead

---

## What it does

- Import activities from Primavera P6 Excel export (baseline + progress updates)
- Multi-project support with per-project role assignments
- Role-based access control enforced at the database level (not just hidden buttons)
- Activity assignment from Planner to Site Engineers
- Site Engineers see and update only their assigned activities
- Constraint register with make-ready tracking (Ready / Not Ready per activity)
- 14-day planning sessions with PPC tracking and variance reason capture
- PPC trend chart across closed sessions
- Daily logs per Site Engineer per session
- Activity history and audit trail (who changed what, when)
- Input validation on import (duplicate IDs, date conflicts)
- Viewer role with read-only access scoped to their linked Site Engineer

---

## Tech stack

- Next.js 14 (App Router)
- TypeScript (strict mode)
- Supabase (PostgreSQL + Auth + Row Level Security)
- Tailwind CSS
- SheetJS (Excel parsing)
- Lucide React (icons)
- Recharts (PPC history chart)

---

## Role hierarchy

```
Admin
  └── Full access to everything across all projects

Planner (Site Manager)
  └── Imports schedules and sets the baseline
  └── Assigns activities to Site Engineers
  └── Manages planning sessions and constraints
  └── Creates users via Admin panel

Site Engineer
  └── Sees only activities assigned to them
  └── Updates progress on their own activities (0–99% freely, 100% only after constraints cleared)
  └── Adds daily logs
  └── Cannot import or change the baseline

Viewer (Worker)
  └── Read-only access to their linked Site Engineer's activities
  └── Cannot change anything
```

> Role is enforced per project via Row Level Security on every table.
> A Site Engineer cannot edit another engineer's activity even by manipulating the request directly —
> the database rejects it.

---

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/Situ-Saw/mini_lookahead.git
   cd mini_lookahead
   ```

2. Copy `.env.example` to `.env.local` and fill in your Supabase values:
   ```
   cp .env.example .env.local
   ```

3. Run `schema.sql` in your Supabase SQL Editor to create all tables,
   enable Row Level Security, and set up all policies.

4. Install dependencies:
   ```
   npm install
   ```

5. Start the development server:
   ```
   npm run dev
   ```

6. Open http://localhost:3000 and log in with your Admin credentials.

---

## Environment variables

See `.env.example` for all required variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

> `SUPABASE_SERVICE_ROLE_KEY` is required for admin operations (user creation, activity history logging).
> Never expose this on the client side.

---

## User ID format

Users are identified by auto-generated IDs in the format:

```
BSL-ADM-0001   → Admin
BSL-PLN-0001   → Planner
BSL-ENG-0001   → Site Engineer
BSL-VWR-0001   → Viewer
```

Login email is derived as `{USER_ID}@lookahead.app`.
Passwords are auto-generated and shown once at user creation.

---

## Importing data

Two import modes are supported:

**Baseline import**
Done once per project. Locks the original planned schedule.
Cannot be re-imported once set.

**Progress update**
Imports actual start and finish dates from Primavera P6.
Recalculates progress % and delay days automatically.
Can be run multiple times as work progresses.

### Validation on import
- Duplicate activity IDs within the same project are **blocked**
- Finish date before start date triggers a **warning** (import proceeds)
- Progress values outside 0–100 trigger a **warning** (import proceeds)

---

## Planning sessions

A planning session covers a 14-day window.
Activities whose `finish_date` falls within the window
are automatically committed to the session.

**PPC formula (correct):**
```
PPC = (activities where was_completed = true) / (total committed activities) × 100
```

PPC updates automatically when a Site Engineer marks their activity as 100% complete.
Planners can also mark activities complete directly as a fallback.

When closing a session with incomplete activities, variance reasons must be captured
per incomplete activity (Material, Design/RFI, Labour, Equipment, Approval, Weather, Other).
These are stored and shown in the PPC history breakdown.

---

## Make-ready (Ready / Not Ready)

Every activity in the Lookahead view shows a **Ready** or **Not Ready** badge.

- **Not Ready** = activity has one or more open constraints
- Clicking "Show reasons" reveals the blocking constraints with type, description, and due date
- Site Engineers cannot mark an activity 100% complete while it has open constraints
- Constraints must be closed first before full completion is allowed

---

## Constraint register

Constraints are linked to real activities (not free text).
Each constraint has:
- Type (Drawing, Material, Labour, Equipment, Approval, RFI, Client Decision)
- Status (Open / Closed)
- Target removal date
- Raised By (auto-filled from logged-in user, locked)
- Description and remarks

---

## Audit trail

Every progress or assignment change is recorded in `activity_history`:
- Who made the change
- What it changed from and to
- When it happened

Viewable per activity via the History button on the Activities page.

---

## Database schema

See `schema.sql` in the project root.

### ER Diagram

#### Layer 1 — Users and Projects

```
PROFILES ||--o{ PROJECT_MEMBERS : "belongs to"
PROJECTS ||--o{ PROJECT_MEMBERS : "has members"

PROFILES {
  uuid      id            PK
  text      name
  text      email
  text      global_role
  boolean   is_active
  timestamp created_at
}

PROJECTS {
  uuid      id            PK
  text      name
  text      code
  uuid      created_by    FK → profiles.id
  timestamp created_at
}

PROJECT_MEMBERS {
  uuid      id            PK
  uuid      project_id    FK → projects.id
  uuid      user_id       FK → profiles.id
  text      role
  timestamp joined_at
}

VIEWER_ASSIGNMENTS {
  uuid      id            PK
  uuid      viewer_id     FK → profiles.id
  uuid      engineer_id   FK → profiles.id
  uuid      project_id    FK → projects.id
  boolean   is_active
}
```

#### Layer 2 — Core Data

```
ACTIVITIES {
  uuid      id              PK
  uuid      project_id      FK → projects.id
  text      activity_id
  text      activity_name
  uuid      assigned_to     FK → profiles.id
  text      status
  integer   progress
  date      start_date
  date      finish_date
  date      act_start_date
  date      act_end_date
  integer   delay_days
  boolean   is_baseline
}

CONSTRAINTS {
  uuid      id              PK
  uuid      project_id      FK → projects.id
  text      activity_id     FK → activities.activity_id
  text      constraint_type
  text      status
  date      target_removal_date
  text      raised_by
  text      description
  text      remarks
  timestamp created_at
  timestamp updated_at
}

ACTIVITY_HISTORY {
  uuid      id            PK
  text      activity_id   FK → activities.activity_id
  uuid      project_id    FK → projects.id
  uuid      changed_by    FK → profiles.id
  integer   progress_from
  integer   progress_to
  text      status_from
  text      status_to
  timestamp changed_at
}
```

#### Layer 3 — Planning Sessions

```
PLANNING_SESSIONS {
  uuid      id            PK
  uuid      project_id    FK → projects.id
  date      start_date
  date      end_date
  text      status
  numeric   ppc_score
  timestamp created_at
  timestamp closed_at
}

SESSION_ACTIVITIES {
  uuid      id              PK
  uuid      session_id      FK → planning_sessions.id
  text      activity_id     FK → activities.activity_id
  uuid      assigned_to     FK → profiles.id
  boolean   was_completed
  text      variance_reason
  timestamp completed_at
  timestamp created_at
}

SESSION_DAILY_LOGS {
  uuid      id            PK
  uuid      session_id    FK → planning_sessions.id (nullable)
  uuid      project_id    FK → projects.id
  uuid      logged_by     FK → profiles.id
  date      log_date
  text      note
  timestamp created_at
}
```

---

## Permissions summary

| Feature | Admin | Planner | Site Engineer | Viewer |
|---|---|---|---|---|
| Import baseline/progress | ✅ | ✅ | ❌ | ❌ |
| View all activities | ✅ | ✅ | ❌ | ❌ |
| View own activities | ✅ | ✅ | ✅ | ✅ (read-only) |
| Update progress | ✅ | ✅ | ✅ (own only) | ❌ |
| Assign activities | ✅ | ✅ | ❌ | ❌ |
| Manage constraints | ✅ | ✅ | ✅ (own) | ❌ |
| View constraints | ✅ | ✅ | ✅ | ❌ |
| Planning sessions | ✅ | ✅ | ❌ | ❌ |
| View lookahead | ✅ | ✅ | ✅ (own) | ✅ (SE's) |
| Daily log | ❌ | ❌ | ✅ | ❌ |
| Admin panel | ✅ | ❌ | ❌ | ❌ |

> All permissions are enforced by Row Level Security at the database level,
> not just by hiding UI elements.

---

## Key design decisions

- **Admin always paired with Planner** in every role check — Admin has full access everywhere.
- **RLS is the source of truth** for data access. UI role checks complement it but do not replace it.
- **SE cannot mark 100% complete with open constraints** — constraints must be resolved first.
- **PPC is driven by SE progress updates**, not Planner actions. When SE sets progress to 100%, `was_completed` in `session_activities` updates automatically.
- **Raised By on constraints is auto-filled and locked** to the logged-in user — cannot be faked.
- **Viewer is linked to a specific SE** via `viewer_assignments`. They see only that SE's activities, enforced by RLS.
- **Daily logs are always available** to Site Engineers regardless of active session status.

---

## Known limitations

- Completed activities cannot be reassigned (by design — assignment is hidden for completed work)
- Mobile view requires further optimization
- Console.error logs are retained for debugging server-side failures; 
  console.log debug statements have been removed
- Multiple concurrent sessions not supported
- Pagination is applied at 50 activities per page on the Activity Master view

---

## Project structure

```
app/
  dashboard/        → Project dashboard with KPIs and timeline
  activities/       → Activity Master (Planner) + My Activities (SE) + read-only (Viewer)
  lookahead/        → Look Ahead with Ready/Not Ready badges
  import/           → Excel import (baseline and progress update)
  constraints/      → Constraint register
  planning/         → 14-day planning sessions, PPC history, variance reasons
  admin/            → Admin panel (user creation, project management)
  select-project/   → Project picker post-login
  api/
    admin/          → create-user, create-project, deactivate-user, reset-password
    activities/     → update-progress
    import/         → baseline and progress update import

lib/
  supabase/         → Supabase client (browser, server, admin)
  hooks/            → useActiveProject, useProjectRole
  admin/            → credentials generation, admin auth
  primavera-import.ts → Excel parsing, activity mapping, validation
  role-access.ts    → ROLE_ACCESS map (single source of truth)

schema.sql          → Full database schema with RLS policies
.env.example        → Environment variable template
```