# Look Ahead Planner

A construction look-ahead planning tool for site engineers,
built as part of an assignment on lean construction planning.

## What it does

- Import activities from Primavera P6 Excel export
- View and filter all project activities
- Filter upcoming activities by look-ahead window (1–99 days)
- Track constraints against activities
- Calculate project delays from actual vs planned dates
- Show PPC and projected end date on the dashboard
- Manage 14-day planning sessions with daily logs
- Track PPC reliability per session with history chart

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Supabase (PostgreSQL)
- Tailwind CSS
- SheetJS (Excel parsing)
- Lucide React (icons)
- Recharts (PPC history chart)

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your Supabase values
3. Run `schema.sql` in your Supabase SQL Editor
4. Install dependencies:
   npm install
5. Start the development server:
   npm run dev
6. Open http://localhost:3000

## Database schema

See `schema.sql` in the project root.
Run it once in Supabase SQL Editor to create all tables,
enable Row Level Security, and set up policies.

## Environment variables

See `.env.example` for required variables:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Importing data

Two import modes are supported:

**Baseline import**
Done once, locks the original planned schedule.
Cannot be re-imported once set.

**Progress update**
Imports actual start and finish dates from Primavera.
Recalculates progress % and delay days automatically.

## Planning sessions

A planning session covers a 14-day window.
Activities whose finish_date falls within the window
are automatically committed to the session.

A session closes when all committed activities are completed.
It can close before 14 days if activities finish early.

PPC per session:
  PPC = (completed activities) / (committed activities) x 100

Daily logs can be added each day within a session to record
reasons for delays such as public holidays or material issues.

Only one active session is supported at a time.
Multiple project support is planned for a future version.

## PPC history

Each closed session stores its PPC score.
The planning page shows a chart of PPC scores over time
so clients and admins can track planning reliability trends.

## Assumptions

- Excel file must be a Primavera P6 export in standard column format
- Baseline import can only be done once per project
- Progress % is derived from actual vs planned duration
- PPC is measured per 14-day planning session, not overall completion
- Role-based access control is planned for a future version
- Authentication is planned for a future version

## Known limitations

- No authentication yet (planned for Assignment 2)
- Mobile view requires further optimization
- Multiple concurrent sessions not yet supported

## Project structure

app/
  dashboard/     → Project dashboard with PPC and timeline
  activities/    → Activity master with delay analysis
  lookahead/     → Upcoming activities filter
  import/        → Excel import (baseline and progress update)
  constraints/   → Constraint register and tracking
  planning/      → 14-day planning sessions and PPC history
  api/           → Server-side API routes
lib/
  supabase.ts          → Supabase client
  primavera-import.ts  → Excel parsing and activity mapping
schema.sql       → Database schema and RLS policies
.env.example     → Environment variable template




## Entity Relationship Diagram For Part 2

### Layer 1 — Users and Projects

```
PROFILES ||--o{ PROJECT_MEMBERS : "belongs to"
PROJECTS ||--o{ PROJECT_MEMBERS : "has members"
PROFILES ||--o{ PROJECTS : "creates"

PROFILES {
  uuid    id          PK
  text    name
  text    email
  text    global_role
  timestamp created_at
}

PROJECTS {
  uuid    id          PK
  text    name
  uuid    created_by  FK → profiles.id
  timestamp created_at
}

PROJECT_MEMBERS {
  uuid    id          PK
  uuid    project_id  FK → projects.id
  uuid    user_id     FK → profiles.id
  text    role
  timestamp joined_at
}
```

> One user can be a Planner on Project BSL and a Viewer on another project simultaneously.
> Role is enforced per project, not globally.

---

### Layer 2 — Core Data

```
PROJECTS       ||--o{ ACTIVITIES         : "contains"
PROJECTS       ||--o{ CONSTRAINTS        : "contains"
PROJECTS       ||--o{ WEEKLY_COMMITMENTS : "has"
ACTIVITIES     ||--o{ CONSTRAINTS        : "has"
ACTIVITIES     ||--o{ WEEKLY_COMMITMENTS : "committed in"
ACTIVITIES     ||--o{ ACTIVITY_HISTORY   : "tracked by"

ACTIVITIES {
  uuid     id              PK
  uuid     project_id      FK → projects.id
  text     activity_id
  text     activity_name
  uuid     assigned_to     FK → profiles.id
  text     status
  integer  progress
  date     start_date
  date     finish_date
  date     act_start_date
  date     act_end_date
  integer  delay_days
  boolean  is_baseline
}

CONSTRAINTS {
  uuid    id              PK
  uuid    project_id      FK → projects.id
  text    activity_id     FK → activities.activity_id
  uuid    assigned_to     FK → profiles.id
  text    constraint_type
  text    status
  date    due_date
  text    description
}

WEEKLY_COMMITMENTS {
  uuid    id              PK
  uuid    project_id      FK → projects.id
  text    activity_id     FK → activities.activity_id
  date    week_start
  boolean committed
  boolean done
  text    variance_reason
}

ACTIVITY_HISTORY {
  uuid      id            PK
  text      activity_id   FK → activities.activity_id
  uuid      changed_by    FK → profiles.id
  integer   progress_from
  integer   progress_to
  text      status_from
  text      status_to
  timestamp changed_at
}
```

---

### Roles and permissions

| Role | Import | Edit any activity | Edit own activity | View only |
|---|---|---|---|---|
| Admin | Yes | Yes | Yes | Yes |
| Planner | Yes | Yes | Yes | Yes |
| Site Engineer | No | No | Yes | Yes |
| Viewer | No | No | No | Yes |

> Role-based access is enforced at the database level through Row Level Security policies,
> not just hidden buttons in the UI.

---

### Key design decisions

- A Site Engineer can only edit activities where `assigned_to = their user id`.
  The database rejects any other update, even if the request is made directly.
- A user cannot see data from projects they are not a member of.
  This is enforced by RLS policies on every table using `project_id`.
- Every progress or status change is recorded in `activity_history` with
  the user who made the change and the before/after values.
- `weekly_commitments` stores whether each committed activity was completed
  that week, and if not — the variance reason (Material, Labour, RFI, etc.).
  This builds the PPC trend over time.
