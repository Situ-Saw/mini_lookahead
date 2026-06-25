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