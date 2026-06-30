"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useActiveProject } from "@/lib/hooks/useActiveProject";
import { useCurrentUser } from "@/lib/contexts/UserContext";
import { hasRoleAccess } from "@/lib/role-access";

const PLANNING_PAGE_BG_CLASS =
  "relative min-h-full w-full bg-gradient-to-br from-[#e8f6f7] via-[#eaf4ff] to-[#f0f9ed] dark:bg-none dark:bg-[#0a1420]";

const PLANNING_TABLE_CARD_CLASS =
  "w-full rounded-xl border border-zinc-200 border-l-4 border-l-[#54B5FB] bg-white shadow-lg shadow-[#54B5FB]/15 dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const PLANNING_FLOATING_CARD_CLASS =
  "rounded-xl border border-zinc-200 border-l-4 border-l-[#359FAB] bg-white shadow-lg shadow-black/5 dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const PLANNING_SAGE_CARD_CLASS =
  "rounded-xl border border-zinc-200 border-l-4 border-l-[#A6DBA0] bg-white shadow-lg shadow-black/5 dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

function PlanningPageShell({
  children,
  contentClassName = "relative mx-auto w-full max-w-7xl flex-1 space-y-8 p-6 sm:p-10",
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className={PLANNING_PAGE_BG_CLASS}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(53,159,171,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(84,181,251,0.25) 0%, transparent 50%)",
        }}
      />
      <div className={contentClassName}>{children}</div>
    </main>
  );
}

const SESSION_LENGTH_DAYS = 14;
const MS_PER_DAY = 86_400_000;

const VARIANCE_REASONS = [
  "Material",
  "Design/RFI",
  "Labour",
  "Equipment",
  "Approval",
  "Weather",
  "Other",
] as const;

type VarianceReason = (typeof VARIANCE_REASONS)[number];

// SQL to run in Supabase:
// ALTER TABLE session_activities
// ADD COLUMN IF NOT EXISTS variance_reason text;

type PlanningSession = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  ppc_score: number | null;
  created_at: string;
  closed_at: string | null;
};

type ActivityPreview = {
  activity_id: string;
  activity_name: string;
  finish_date: string | null;
};

type SessionActivityRow = {
  id: string;
  session_id: string;
  activity_id: string;
  was_completed: boolean;
  completed_at: string | null;
  created_at: string;
  activities: {
    activity_name: string;
    finish_date: string | null;
    status: string | null;
    progress: number | null;
  } | null;
};

function normalizeSessionActivityRow(
  row: Record<string, unknown>,
): SessionActivityRow {
  const activities = row.activities;
  const activity =
    Array.isArray(activities) && activities.length > 0
      ? (activities[0] as SessionActivityRow["activities"])
      : ((activities as SessionActivityRow["activities"]) ?? null);

  return {
    id: String(row.id),
    session_id: String(row.session_id),
    activity_id: String(row.activity_id),
    was_completed: Boolean(row.was_completed),
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at),
    activities: activity,
  };
}

type SessionActivitySummary = {
  id: string;
  was_completed: boolean;
  variance_reason: string | null;
};

type ClosedSession = PlanningSession & {
  session_activities: SessionActivitySummary[] | null;
};

type SessionDetailActivity = {
  activity_id: string;
  activity_name: string;
  was_completed: boolean;
  variance_reason: string | null;
  completed_at: string | null;
  assigned_name: string | null;
};

type ChartDatum = {
  id: string;
  label: string;
  ppc: number;
  total: number;
  completed: number;
  startDate: string;
  endDate: string;
};

type StatusCategory = "not_started" | "in_progress" | "completed" | "other";

type ProjectEngineer = {
  user_id: string;
  name: string;
};

type ActivityAssignment = {
  user_id: string;
  name: string;
};

async function loadProjectEngineers(
  projectId: string,
): Promise<ProjectEngineer[]> {
  const { data: members, error: memberError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("role", "site_engineer");

  if (memberError) {
    console.error("Failed to load site engineers:", memberError.message);
    return [];
  }

  const userIds = (members ?? [])
    .map((member) => member.user_id)
    .filter((userId): userId is string => typeof userId === "string");

  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", userIds)
    .order("name", { ascending: true });

  if (profileError) {
    console.error("Failed to load engineer profiles:", profileError.message);
    return [];
  }

  return (profiles ?? []).map((profile) => ({
    user_id: String(profile.id),
    name: String(profile.name ?? ""),
  }));
}

async function loadAssignmentMap(
  projectId: string,
  activityIds: string[],
): Promise<Record<string, ActivityAssignment | null>> {
  const map: Record<string, ActivityAssignment | null> = {};

  for (const activityId of activityIds) {
    map[activityId] = null;
  }

  if (activityIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("activities")
    .select("activity_id, assigned_to")
    .eq("project_id", projectId)
    .in("activity_id", activityIds);

  if (error) {
    console.error("Failed to load activity assignments:", error.message);
    return map;
  }

  const assignedUserIds = [
    ...new Set(
      (data ?? [])
        .map((row) => row.assigned_to)
        .filter((userId): userId is string => typeof userId === "string"),
    ),
  ];

  const nameByUserId: Record<string, string> = {};

  if (assignedUserIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", assignedUserIds);

    if (profileError) {
      console.error("Failed to load assignee profiles:", profileError.message);
    } else {
      for (const profile of profiles ?? []) {
        nameByUserId[String(profile.id)] = String(profile.name ?? "Unknown");
      }
    }
  }

  for (const row of data ?? []) {
    if (typeof row.activity_id !== "string" || !row.assigned_to) {
      continue;
    }

    map[row.activity_id] = {
      user_id: row.assigned_to,
      name: nameByUserId[row.assigned_to] ?? "Unknown",
    };
  }

  return map;
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso(): string {
  return dateToIso(startOfToday());
}

function addDaysToIso(isoDate: string, days: number): string {
  const parsed = parseDateOnly(isoDate);
  if (!parsed) return isoDate;

  const result = new Date(parsed);
  result.setDate(result.getDate() + days);
  return dateToIso(result);
}

function clampIsoDateToMinimum(value: string, minimum: string): string {
  if (!value || value < minimum) return minimum;
  return value;
}

function calculateMinStartDate(lastClosedEndDate: string | null): string {
  const today = todayIso();

  if (!lastClosedEndDate) return today;

  const dayAfterPrevious = addDaysToIso(lastClosedEndDate, 1);
  return dayAfterPrevious < today ? today : dayAfterPrevious;
}

function differenceInCalendarDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = parseDateOnly(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSessionRange(start: string, end: string): string {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) return `${start} - ${end}`;

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function calculatePpc(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 1000) / 10;
}

function getPpcColorClasses(ppc: number): {
  badge: string;
  bar: string;
} {
  if (ppc >= 71) {
    return {
      badge:
        "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900",
      bar: "#10b981",
    };
  }
  if (ppc >= 41) {
    return {
      badge:
        "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900",
      bar: "#f59e0b",
    };
  }
  return {
    badge:
      "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900",
    bar: "#ef4444",
  };
}

function getStatusCategory(status: string | null): StatusCategory {
  if (!status) return "other";

  const normalized = status.toLowerCase().trim();

  if (
    (normalized.includes("not") && normalized.includes("start")) ||
    normalized === "tk_notstart" ||
    normalized === "ns"
  ) {
    return "not_started";
  }

  if (
    normalized.includes("progress") ||
    normalized.includes("active") ||
    normalized === "tk_active"
  ) {
    return "in_progress";
  }

  if (normalized.includes("complete") || normalized === "tk_complete") {
    return "completed";
  }

  return "other";
}

function isIncompleteSessionActivity(row: SessionActivityRow): boolean {
  if (row.was_completed) {
    return false;
  }

  const status = row.activities?.status ?? null;
  if (status === "Completed") {
    return false;
  }

  return getStatusCategory(status) !== "completed";
}

function formatVarianceBreakdown(
  activities: SessionActivitySummary[],
): Array<{ reason: string; count: number }> {
  const hasIncomplete = activities.some((row) => !row.was_completed);
  if (!hasIncomplete) {
    return [];
  }

  const counts = new Map<string, number>();

  for (const row of activities) {
    if (row.was_completed || !row.variance_reason) {
      continue;
    }

    counts.set(
      row.variance_reason,
      (counts.get(row.variance_reason) ?? 0) + 1,
    );
  }

  return Array.from(counts.entries()).map(([reason, count]) => ({
    reason,
    count,
  }));
}

function getStatusLabel(status: string | null): string {
  if (!status) return "Unknown";

  const category = getStatusCategory(status);
  switch (category) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function StatusBadge({ status }: { status: string | null }) {
  const category = getStatusCategory(status);
  const label = getStatusLabel(status);

  const className =
    category === "not_started"
      ? "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
      : category === "in_progress"
        ? "bg-blue-100 text-blue-800 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-900"
        : category === "completed"
          ? "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900"
          : "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

function PpcBadge({ ppc }: { ppc: number }) {
  const colors = getPpcColorClasses(ppc);

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${colors.badge}`}
    >
      PPC {ppc.toFixed(1)}%
    </span>
  );
}

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
};

function PpcChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-zinc-900">
        {formatSessionRange(data.startDate, data.endDate)}
      </p>
      <p className="mt-1 text-zinc-600">
        PPC: {data.ppc.toFixed(1)}%
      </p>
      <p className="text-zinc-600">
        Completed: {data.completed} / {data.total}
      </p>
    </div>
  );
}

async function loadSessionDetailActivities(
  sessionId: string,
  projectId: string,
): Promise<{ activities: SessionDetailActivity[]; error: string | null }> {
  const { data: rows, error } = await supabase
    .from("session_activities")
    .select(
      "activity_id, was_completed, variance_reason, completed_at, assigned_to",
    )
    .eq("session_id", sessionId)
    .order("activity_id");

  if (error) {
    return { activities: [], error: error.message };
  }

  const sessionRows = rows ?? [];

  if (sessionRows.length === 0) {
    return { activities: [], error: null };
  }

  const activityIds = sessionRows.map((row) => row.activity_id);
  const assigneeIds = [
    ...new Set(
      sessionRows
        .map((row) => row.assigned_to)
        .filter((userId): userId is string => typeof userId === "string"),
    ),
  ];

  const activitiesQuery = supabase
    .from("activities")
    .select("activity_id, activity_name")
    .eq("project_id", projectId)
    .in("activity_id", activityIds);

  const profilesQuery =
    assigneeIds.length > 0
      ? supabase.from("profiles").select("id, name").in("id", assigneeIds)
      : Promise.resolve({ data: [], error: null });

  const [activitiesResult, profilesResult] = await Promise.all([
    activitiesQuery,
    profilesQuery,
  ]);

  if (activitiesResult.error) {
    return { activities: [], error: activitiesResult.error.message };
  }

  if (profilesResult.error) {
    return { activities: [], error: profilesResult.error.message };
  }

  const nameByActivityId = new Map(
    (activitiesResult.data ?? []).map((row) => [
      row.activity_id,
      row.activity_name,
    ]),
  );
  const nameByUserId = new Map(
    (profilesResult.data ?? []).map((row) => [row.id, row.name]),
  );

  const activities = sessionRows.map((row) => ({
    activity_id: row.activity_id,
    activity_name: nameByActivityId.get(row.activity_id) ?? "—",
    was_completed: Boolean(row.was_completed),
    variance_reason:
      typeof row.variance_reason === "string" ? row.variance_reason : null,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    assigned_name:
      typeof row.assigned_to === "string"
        ? (nameByUserId.get(row.assigned_to) ?? "Unassigned")
        : "Unassigned",
  }));

  return { activities, error: null };
}

function SessionDetailModal({
  session,
  activities,
  isLoading,
  errorMessage,
  onClose,
}: {
  session: ClosedSession;
  activities: SessionDetailActivity[];
  isLoading: boolean;
  errorMessage: string | null;
  onClose: () => void;
}) {
  const total = activities.length;
  const completed = activities.filter((row) => row.was_completed).length;
  const ppc =
    session.ppc_score !== null && session.ppc_score !== undefined
      ? Number(session.ppc_score)
      : calculatePpc(completed, total);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-detail-title"
        className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-200/30 dark:bg-white/95"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="session-detail-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-900"
          >
            Session Details —{" "}
            {formatSessionRange(session.start_date, session.end_date)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-500">
          Total: {total} | Completed: {completed} | PPC: {ppc}%
        </p>

        {isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading session details...
          </div>
        ) : errorMessage ? (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {errorMessage}
          </p>
        ) : activities.length === 0 ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-500">
            No activities recorded for this session.
          </p>
        ) : (
          <div className={`mt-6 overflow-x-auto ${PLANNING_TABLE_CARD_CLASS}`}>
            <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Activity ID
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Activity Name
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Assigned To
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Status
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Variance Reason
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                    Completed At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-200">
                {activities.map((row) => (
                  <tr key={row.activity_id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-500">
                      {row.activity_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-900">
                      {row.activity_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-500">
                      {row.assigned_name ?? "Unassigned"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.was_completed ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900">
                          Not Completed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-500">
                      {row.variance_reason ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-500">
                      {formatDateTime(row.completed_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function VarianceCloseModal({
  incompleteActivities,
  varianceReasons,
  otherReasons,
  isClosing,
  errorMessage,
  allReasonsSelected,
  onReasonChange,
  onOtherReasonChange,
  onConfirm,
  onCancel,
}: {
  incompleteActivities: SessionActivityRow[];
  varianceReasons: Record<string, VarianceReason | "">;
  otherReasons: Record<string, string>;
  isClosing: boolean;
  errorMessage: string | null;
  allReasonsSelected: boolean;
  onReasonChange: (activityId: string, reason: VarianceReason) => void;
  onOtherReasonChange: (activityId: string, text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isClosing) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClosing, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={isClosing ? undefined : onCancel}
        disabled={isClosing}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="variance-modal-title"
        className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-200/30 dark:bg-white/95"
      >
        <h2
          id="variance-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-900"
        >
          Close Session — Capture Variance Reasons
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-500">
          The following activities were not completed. Select a reason for each
          before closing.
        </p>

        <div className="mt-5 space-y-4">
          {incompleteActivities.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-200 dark:bg-zinc-50"
            >
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-500">
                {row.activity_id}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-900">
                {row.activities?.activity_name ?? "—"}
              </p>
              <select
                value={varianceReasons[row.id] ?? ""}
                disabled={isClosing}
                onChange={(event) =>
                  onReasonChange(row.id, event.target.value as VarianceReason)
                }
                className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900"
              >
                <option value="" disabled>
                  Select reason...
                </option>
                {VARIANCE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              {varianceReasons[row.id] === "Other" && (
                <input
                  type="text"
                  value={otherReasons[row.id] ?? ""}
                  disabled={isClosing}
                  required
                  placeholder="Describe the reason..."
                  onChange={(event) =>
                    onOtherReasonChange(row.id, event.target.value)
                  }
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900"
                />
              )}
            </div>
          ))}
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {errorMessage}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={isClosing || !allReasonsSelected}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
          >
            {isClosing ? "Closing..." : "Confirm Close"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isClosing}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlanningPage() {
  const router = useRouter();
  const {
    projectRole: role,
    projectId,
    isLoading: isUserContextLoading,
    isProjectRoleLoading,
  } = useCurrentUser();
  const isRoleLoading = isUserContextLoading || isProjectRoleLoading;
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const [activeSession, setActiveSession] = useState<PlanningSession | null>(
    null,
  );
  const [sessionActivities, setSessionActivities] = useState<
    SessionActivityRow[]
  >([]);
  const [closedSessions, setClosedSessions] = useState<ClosedSession[]>([]);
  const [previewActivities, setPreviewActivities] = useState<ActivityPreview[]>(
    [],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [lastClosedSessionEndDate, setLastClosedSessionEndDate] = useState<
    string | null
  >(null);
  const [startDateInput, setStartDateInput] = useState(todayIso);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [actionActivityId, setActionActivityId] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showVarianceModal, setShowVarianceModal] = useState(false);
  const [incompleteActivities, setIncompleteActivities] = useState<
    SessionActivityRow[]
  >([]);
  const [varianceReasons, setVarianceReasons] = useState<
    Record<string, VarianceReason | "">
  >({});
  const [otherReasons, setOtherReasons] = useState<Record<string, string>>({});
  const [varianceModalError, setVarianceModalError] = useState<string | null>(
    null,
  );
  const [detailSession, setDetailSession] = useState<ClosedSession | null>(null);
  const [sessionDetailActivities, setSessionDetailActivities] = useState<
    SessionDetailActivity[]
  >([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [sessionDetailError, setSessionDetailError] = useState<string | null>(
    null,
  );

  const [engineers, setEngineers] = useState<ProjectEngineer[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<
    Record<string, ActivityAssignment | null>
  >({});
  const [savingAssignMap, setSavingAssignMap] = useState<Record<string, boolean>>(
    {},
  );
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [reassigningActivityIds, setReassigningActivityIds] = useState<
    Set<string>
  >(new Set());

  const canManageAssignments =
    role === "admin" || role === "planner";

  const loadData = useCallback(async () => {
    if (!activeProject || !projectId) return;

    setIsLoading(true);
    setFetchError(null);

    const engineersList = await loadProjectEngineers(projectId);
    setEngineers(engineersList);

    const { data: activeData, error: activeError } = await supabase
      .from("planning_sessions")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (activeError) {
      setFetchError(activeError.message);
      setActiveSession(null);
      setSessionActivities([]);
      setClosedSessions([]);
      setAssignmentMap({});
      setReassigningActivityIds(new Set());
      setIsLoading(false);
      return;
    }

    const session = activeData as PlanningSession | null;
    setActiveSession(session);

    if (session) {
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("session_activities")
        .select(
          `
            id,
            session_id,
            activity_id,
            was_completed,
            completed_at,
            created_at,
            activities (
              activity_name,
              finish_date,
              status,
              progress
            )
          `,
        )
        .eq("session_id", session.id)
        .order("activity_id");

      if (activitiesError) {
        setFetchError(activitiesError.message);
        setSessionActivities([]);
        setAssignmentMap({});
        setReassigningActivityIds(new Set());
      } else {
        const normalizedActivities = (activitiesData ?? []).map((row) =>
          normalizeSessionActivityRow(row as Record<string, unknown>),
        );
        setSessionActivities(normalizedActivities);

        const activityIds = normalizedActivities.map((row) => row.activity_id);
        const nextAssignmentMap = await loadAssignmentMap(
          projectId,
          activityIds,
        );
        setAssignmentMap(nextAssignmentMap);
        setReassigningActivityIds(new Set());
      }
    } else {
      setSessionActivities([]);
      setAssignmentMap({});
      setReassigningActivityIds(new Set());
    }

    const [closedResult, lastClosedResult] = await Promise.all([
      supabase
        .from("planning_sessions")
        .select(
          `
          id,
          start_date,
          end_date,
          status,
          ppc_score,
          created_at,
          closed_at,
          session_activities (
            id,
            was_completed,
            variance_reason
          )
        `,
        )
        .eq("project_id", projectId)
        .eq("status", "closed")
        .order("created_at", { ascending: false }),
      supabase
        .from("planning_sessions")
        .select("end_date")
        .eq("project_id", projectId)
        .eq("status", "closed")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (closedResult.error) {
      setFetchError((current) => current ?? closedResult.error.message);
      setClosedSessions([]);
    } else {
      setClosedSessions((closedResult.data ?? []) as ClosedSession[]);
    }

    if (lastClosedResult.error) {
      setFetchError((current) => current ?? lastClosedResult.error.message);
      setLastClosedSessionEndDate(null);
    } else {
      setLastClosedSessionEndDate(
        (lastClosedResult.data as { end_date: string } | null)?.end_date ?? null,
      );
    }

    setIsLoading(false);
  }, [activeProject, projectId]);

  useEffect(() => {
    document.title = "Planning Sessions";
  }, []);

  useEffect(() => {
    if (isRoleLoading) {
      return;
    }

    if (!hasRoleAccess(role, "planning")) {
      router.push("/dashboard");
    }
  }, [role, isRoleLoading, router]);

  useEffect(() => {
    if (
      !activeProject ||
      !projectId ||
      isRoleLoading ||
      !hasRoleAccess(role, "planning")
    ) {
      return;
    }

    void loadData();
  }, [loadData, activeProject, projectId, isRoleLoading, role]);

  const minStartDate = useMemo(
    () => calculateMinStartDate(lastClosedSessionEndDate),
    [lastClosedSessionEndDate],
  );

  useEffect(() => {
    if (activeSession || isLoading) return;

    setStartDateInput((current) => clampIsoDateToMinimum(current, minStartDate));
  }, [activeSession, isLoading, minStartDate]);

  const handleStartDateChange = useCallback(
    (value: string) => {
      setStartDateInput(clampIsoDateToMinimum(value, minStartDate));
    },
    [minStartDate],
  );

  const startDateHint = useMemo(() => {
    if (!lastClosedSessionEndDate) {
      return "Sessions can start from today onwards";
    }

    return `Sessions can start from ${formatDate(minStartDate)} (day after previous session ended)`;
  }, [lastClosedSessionEndDate, minStartDate]);

  useEffect(() => {
    if (!activeProject || activeSession || isLoading) return;

    const projectId = activeProject.id;
    let isMounted = true;

    async function loadPreview() {
      setIsPreviewLoading(true);
      const endDate = addDaysToIso(startDateInput, SESSION_LENGTH_DAYS);

      const { data, error } = await supabase
        .from("activities")
        .select("activity_id, activity_name, finish_date")
        .eq("project_id", projectId)
        .gte("finish_date", startDateInput)
        .lte("finish_date", endDate)
        .order("activity_id");

      if (!isMounted) return;

      if (error) {
        setActionError(error.message);
        setPreviewActivities([]);
      } else {
        setPreviewActivities((data ?? []) as ActivityPreview[]);
      }

      setIsPreviewLoading(false);
    }

    void loadPreview();

    return () => {
      isMounted = false;
    };
  }, [activeProject, activeSession, isLoading, startDateInput]);

  const livePpc =
    activeSession?.ppc_score !== null && activeSession?.ppc_score !== undefined
      ? Number(activeSession.ppc_score)
      : 0;

  const refreshPpcFromDb = useCallback(async (sessionId: string) => {
    const { data, error } = await supabase
      .from("planning_sessions")
      .select("ppc_score")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      console.error("Failed to refresh PPC score:", error.message);
      return null;
    }

    const ppcScore =
      data?.ppc_score !== null && data?.ppc_score !== undefined
        ? Number(data.ppc_score)
        : 0;

    setActiveSession((current) =>
      current && current.id === sessionId
        ? { ...current, ppc_score: ppcScore }
        : current,
    );

    return ppcScore;
  }, []);

  const allVarianceReasonsSelected = useMemo(() => {
    if (incompleteActivities.length === 0) {
      return false;
    }

    return incompleteActivities.every((row) => {
      const reason = varianceReasons[row.id];
      if (reason === "" || reason === undefined) {
        return false;
      }

      if (reason === "Other") {
        return (otherReasons[row.id] ?? "").trim().length > 0;
      }

      return true;
    });
  }, [incompleteActivities, varianceReasons, otherReasons]);

  const daysRemaining = useMemo(() => {
    if (!activeSession) return 0;

    const end = parseDateOnly(activeSession.end_date);
    const today = startOfToday();
    if (!end) return 0;

    return Math.max(0, differenceInCalendarDays(end, today));
  }, [activeSession]);

  const chartData = useMemo<ChartDatum[]>(() => {
    return closedSessions.map((session) => {
      const activities = session.session_activities ?? [];
      const total = activities.length;
      const completed = activities.filter((row) => row.was_completed).length;
      const ppc =
        session.ppc_score !== null && session.ppc_score !== undefined
          ? Number(session.ppc_score)
          : calculatePpc(completed, total);

      return {
        id: session.id,
        label: formatSessionRange(session.start_date, session.end_date),
        ppc,
        total,
        completed,
        startDate: session.start_date,
        endDate: session.end_date,
      };
    });
  }, [closedSessions]);

  const updateSessionActivityStatus = useCallback(
    (
      sessionActivityId: string,
      updates: {
        was_completed?: boolean;
        completed_at?: string | null;
        status?: string;
        progress?: number;
      },
    ) => {
      setSessionActivities((current) =>
        current.map((row) => {
          if (row.id !== sessionActivityId) return row;

          return {
            ...row,
            was_completed:
              updates.was_completed !== undefined
                ? updates.was_completed
                : row.was_completed,
            completed_at:
              updates.completed_at !== undefined
                ? updates.completed_at
                : row.completed_at,
            activities: row.activities
              ? {
                  ...row.activities,
                  status:
                    updates.status !== undefined
                      ? updates.status
                      : row.activities.status,
                  progress:
                    updates.progress !== undefined
                      ? updates.progress
                      : row.activities.progress,
                }
              : row.activities,
          };
        }),
      );
    },
    [],
  );

  const handleAssign = useCallback(
    async (activityId: string, userId: string) => {
      if (!activeProject || !activeSession) {
        return;
      }

      setSavingAssignMap((current) => ({ ...current, [activityId]: true }));
      setAssignErrors((current) => {
        const next = { ...current };
        delete next[activityId];
        return next;
      });

      const { error: activitiesError } = await supabase
        .from("activities")
        .update({ assigned_to: userId })
        .eq("activity_id", activityId)
        .eq("project_id", activeProject.id);

      if (activitiesError) {
        setAssignErrors((current) => ({
          ...current,
          [activityId]: activitiesError.message,
        }));
        setSavingAssignMap((current) => ({ ...current, [activityId]: false }));
        return;
      }

      const { error: sessionActivitiesError } = await supabase
        .from("session_activities")
        .update({ assigned_to: userId })
        .eq("session_id", activeSession.id)
        .eq("activity_id", activityId);

      if (sessionActivitiesError) {
        setAssignErrors((current) => ({
          ...current,
          [activityId]: sessionActivitiesError.message,
        }));
        setSavingAssignMap((current) => ({ ...current, [activityId]: false }));
        return;
      }

      const assignedEngineer = engineers.find(
        (engineer) => engineer.user_id === userId,
      );

      setAssignmentMap((current) => ({
        ...current,
        [activityId]: {
          user_id: userId,
          name: assignedEngineer?.name ?? "Unknown",
        },
      }));
      setReassigningActivityIds((current) => {
        const next = new Set(current);
        next.delete(activityId);
        return next;
      });
      setSavingAssignMap((current) => ({ ...current, [activityId]: false }));
    },
    [activeProject, activeSession, engineers],
  );

  const handleMarkInProgress = useCallback(
    async (sessionActivityId: string, activityId: string) => {
      if (!activeProject) return;

      setActionError(null);
      setActionActivityId(sessionActivityId);

      const { error } = await supabase
        .from("activities")
        .update({ status: "In Progress" })
        .eq("project_id", activeProject.id)
        .eq("activity_id", activityId);

      if (error) {
        setActionError(error.message);
        setActionActivityId(null);
        return;
      }

      updateSessionActivityStatus(sessionActivityId, {
        status: "In Progress",
      });
      setActionActivityId(null);
    },
    [activeProject, updateSessionActivityStatus],
  );

  // PPC is primarily driven by SE progress updates via
  // /api/activities/update-progress. This is a fallback
  // for admin/planner direct completion.
  const handleMarkComplete = useCallback(
    async (sessionActivityId: string, activityId: string) => {
      if (!activeProject || !activeSession) return;

      setActionError(null);
      setActionActivityId(sessionActivityId);

      try {
        const historyResponse = await fetch("/api/activities/update-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: activityId,
            project_id: activeProject.id,
            progress: 100,
          }),
        });

        if (!historyResponse.ok) {
          const historyBody = (await historyResponse.json()) as {
            error?: string;
          };
          setActionError(
            historyBody.error ?? "Failed to mark activity complete.",
          );
          setActionActivityId(null);
          return;
        }
      } catch {
        setActionError("Failed to mark activity complete.");
        setActionActivityId(null);
        return;
      }

      const completedAt = new Date().toISOString();

      const { error: sessionError } = await supabase
        .from("session_activities")
        .update({ was_completed: true, completed_at: completedAt })
        .eq("session_id", activeSession.id)
        .eq("activity_id", activityId);

      if (sessionError) {
        setActionError(sessionError.message);
        setActionActivityId(null);
        return;
      }

      updateSessionActivityStatus(sessionActivityId, {
        was_completed: true,
        completed_at: completedAt,
        status: "Completed",
        progress: 100,
      });
      await refreshPpcFromDb(activeSession.id);
      setActionActivityId(null);
    },
    [
      activeProject,
      activeSession,
      updateSessionActivityStatus,
      refreshPpcFromDb,
    ],
  );

  const handleCloseSessionClick = useCallback(() => {
    const incomplete = sessionActivities.filter(isIncompleteSessionActivity);

    if (incomplete.length === 0) {
      setShowCloseConfirm(true);
      return;
    }

    const initialReasons: Record<string, VarianceReason | ""> = {};
    for (const row of incomplete) {
      initialReasons[row.id] = "";
    }

    setIncompleteActivities(incomplete);
    setVarianceReasons(initialReasons);
    setOtherReasons({});
    setVarianceModalError(null);
    setShowVarianceModal(true);
  }, [sessionActivities]);

  const handleCancelVarianceModal = useCallback(() => {
    if (isClosing) {
      return;
    }

    setShowVarianceModal(false);
    setIncompleteActivities([]);
    setVarianceReasons({});
    setOtherReasons({});
    setVarianceModalError(null);
  }, [isClosing]);

  const handleOpenSessionDetail = useCallback(
    async (session: ClosedSession) => {
      if (!activeProject) {
        return;
      }

      setDetailSession(session);
      setSessionDetailActivities([]);
      setSessionDetailError(null);
      setIsLoadingDetail(true);

      const { activities, error } = await loadSessionDetailActivities(
        session.id,
        activeProject.id,
      );

      setSessionDetailActivities(activities);
      setSessionDetailError(error);
      setIsLoadingDetail(false);
    },
    [activeProject],
  );

  const handleCloseSessionDetail = useCallback(() => {
    setDetailSession(null);
    setSessionDetailActivities([]);
    setSessionDetailError(null);
    setIsLoadingDetail(false);
  }, []);

  const handleVarianceReasonChange = useCallback(
    (activityId: string, reason: VarianceReason) => {
      setVarianceReasons((current) => ({ ...current, [activityId]: reason }));
      if (reason !== "Other") {
        setOtherReasons((current) => {
          const next = { ...current };
          delete next[activityId];
          return next;
        });
      }
    },
    [],
  );

  const handleOtherReasonChange = useCallback(
    (activityId: string, text: string) => {
      setOtherReasons((current) => ({ ...current, [activityId]: text }));
    },
    [],
  );

  const closeActiveSession = useCallback(async () => {
    if (!activeSession) {
      return false;
    }

    const ppcScore =
      activeSession.ppc_score !== null && activeSession.ppc_score !== undefined
        ? Number(activeSession.ppc_score)
        : livePpc;
    const closedAt = new Date().toISOString();

    const { error } = await supabase
      .from("planning_sessions")
      .update({
        status: "closed",
        closed_at: closedAt,
        ppc_score: ppcScore,
      })
      .eq("id", activeSession.id);

    if (error) {
      return error.message;
    }

    return null;
  }, [activeSession, livePpc]);

  const handleConfirmVarianceClose = useCallback(async () => {
    if (!activeSession || !allVarianceReasonsSelected) {
      return;
    }

    setIsClosing(true);
    setVarianceModalError(null);

    for (const row of incompleteActivities) {
      const reason = varianceReasons[row.id];
      const varianceReason =
        reason === "Other"
          ? `Other: ${(otherReasons[row.id] ?? "").trim()}`
          : reason;

      const { error } = await supabase
        .from("session_activities")
        .update({ variance_reason: varianceReason })
        .eq("id", row.id);

      if (error) {
        setVarianceModalError(error.message);
        setIsClosing(false);
        return;
      }
    }

    const closeError = await closeActiveSession();
    if (closeError) {
      setVarianceModalError(closeError);
      setIsClosing(false);
      return;
    }

    setShowVarianceModal(false);
    setIncompleteActivities([]);
    setVarianceReasons({});
    setOtherReasons({});
    setIsClosing(false);
    await loadData();
  }, [
    activeSession,
    allVarianceReasonsSelected,
    closeActiveSession,
    incompleteActivities,
    loadData,
    otherReasons,
    varianceReasons,
  ]);

  const handleCloseSession = useCallback(async () => {
    if (!activeSession) return;

    setIsClosing(true);
    setActionError(null);

    const closeError = await closeActiveSession();
    if (closeError) {
      setActionError(closeError);
      setIsClosing(false);
      setShowCloseConfirm(false);
      return;
    }

    setShowCloseConfirm(false);
    setIsClosing(false);
    await loadData();
  }, [activeSession, closeActiveSession, loadData]);

  const handleStartSession = useCallback(async () => {
    if (!activeProject || activeSession || previewActivities.length === 0) return;

    setIsStarting(true);
    setActionError(null);

    const endDate = addDaysToIso(startDateInput, SESSION_LENGTH_DAYS);

    const { data: session, error: sessionError } = await supabase
      .from("planning_sessions")
      .insert({
        project_id: activeProject.id,
        start_date: startDateInput,
        end_date: endDate,
        status: "active",
      })
      .select()
      .single();

    if (sessionError || !session) {
      setActionError(sessionError?.message ?? "Failed to create planning session.");
      setIsStarting(false);
      return;
    }

    const activityRows = previewActivities.map((activity) => ({
      session_id: session.id,
      activity_id: activity.activity_id,
      was_completed: false,
    }));

    const { error: activitiesError } = await supabase
      .from("session_activities")
      .insert(activityRows);

    if (activitiesError) {
      setActionError(activitiesError.message);
      setIsStarting(false);
      return;
    }

    const committedActivityIds = previewActivities.map(
      (activity) => activity.activity_id,
    );

    const { data: completedActivities, error: completedLookupError } =
      await supabase
        .from("activities")
        .select("activity_id")
        .eq("project_id", activeProject.id)
        .eq("status", "Completed")
        .in("activity_id", committedActivityIds);

    if (completedLookupError) {
      setActionError(completedLookupError.message);
      setIsStarting(false);
      return;
    }

    const completedActivityIds = (completedActivities ?? []).map(
      (activity) => activity.activity_id,
    );

    if (completedActivityIds.length > 0) {
      const completedAt = new Date().toISOString();

      const { error: syncError } = await supabase
        .from("session_activities")
        .update({ was_completed: true, completed_at: completedAt })
        .eq("session_id", session.id)
        .in("activity_id", completedActivityIds);

      if (syncError) {
        setActionError(syncError.message);
        setIsStarting(false);
        return;
      }
    }

    setIsStarting(false);
    await loadData();
  }, [
    activeProject,
    activeSession,
    previewActivities,
    startDateInput,
    loadData,
  ]);

  if (isProjectLoading || isRoleLoading) {
    return (
      <PlanningPageShell contentClassName="relative mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-[#359FAB] dark:text-[#54B5FB]"
          aria-label="Loading project"
        />
      </PlanningPageShell>
    );
  }

  if (!hasRoleAccess(role, "planning")) {
    return (
      <PlanningPageShell contentClassName="relative mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-[#359FAB] dark:text-[#54B5FB]"
          aria-label="Checking access"
        />
      </PlanningPageShell>
    );
  }

  if (!activeProject) {
    return (
      <PlanningPageShell>
        <div className={`${PLANNING_FLOATING_CARD_CLASS} p-8 text-center`}>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-500">
            No project selected.
            <br />
            Please select a project to continue.
          </p>
          <Link
            href="/select-project"
            className="mt-4 inline-flex rounded-lg bg-[#0a1420] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Select Project
          </Link>
        </div>
      </PlanningPageShell>
    );
  }

  if (fetchError && isLoading) {
    return (
      <PlanningPageShell>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Planning Sessions
        </h1>
        <p className="mt-6 rounded-lg border border-red-200 border-l-4 border-l-red-500 bg-white px-4 py-3 text-sm text-red-800 shadow-lg shadow-red-500/10 dark:bg-white/95">
          Failed to load planning data: {fetchError}
        </p>
      </PlanningPageShell>
    );
  }

  return (
    <PlanningPageShell>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Planning Sessions
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Manage 14-day planning sessions and track PPC performance.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-medium text-zinc-700 shadow-sm dark:bg-white/95 dark:text-zinc-700">
            {activeProject.code} — {activeProject.name}
          </span>
        </p>
      </div>

      {fetchError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {fetchError}
        </p>
      )}

      {actionError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </p>
      )}

      {isLoading ? (
        <div className={`${PLANNING_FLOATING_CARD_CLASS} px-4 py-12 text-center text-sm text-zinc-600 dark:text-zinc-500`}>
          Loading planning session...
        </div>
      ) : activeSession ? (
        <>
          <section className={`${PLANNING_FLOATING_CARD_CLASS} p-6`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
                  Active Planning Session
                </h2>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-500">
                  {formatDate(activeSession.start_date)} —{" "}
                  {formatDate(activeSession.end_date)}
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-700 dark:text-zinc-500">
                  {daysRemaining} day{daysRemaining === 1 ? "" : "s"} remaining
                </p>
              </div>
              <PpcBadge ppc={livePpc} />
            </div>
          </section>

          <section className={PLANNING_TABLE_CARD_CLASS}>
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
                Committed Activities
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
                {sessionActivities.length} activit
                {sessionActivities.length === 1 ? "y" : "ies"} in this session
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Activity ID
                    </th>
                    <th className="min-w-[12rem] px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Activity Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Planned Finish
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Status
                    </th>
                    {canManageAssignments && (
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                        Assignment
                      </th>
                    )}
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-200">
                  {sessionActivities.map((row) => (
                    <tr key={row.id} className="hover:bg-zinc-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-500">
                        {row.activity_id}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-900">
                        {row.activities?.activity_name ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-500">
                        {formatDate(row.activities?.finish_date ?? null)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={row.activities?.status ?? null} />
                      </td>
                      {canManageAssignments && (
                        <td className="whitespace-nowrap px-4 py-3">
                          {(() => {
                            const status = row.activities?.status ?? null;
                            const isActivityDone =
                              row.was_completed ||
                              status === "Completed" ||
                              getStatusCategory(status) === "completed";

                            if (isActivityDone) {
                              return (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                  —
                                </span>
                              );
                            }

                            const assignment = assignmentMap[row.activity_id];
                            const isSavingAssign =
                              savingAssignMap[row.activity_id] === true;
                            const assignError = assignErrors[row.activity_id];
                            const showDropdown =
                              !assignment ||
                              reassigningActivityIds.has(row.activity_id);

                            if (showDropdown) {
                              return (
                                <div className="space-y-1">
                                  <select
                                    value=""
                                    disabled={isSavingAssign}
                                    onChange={(event) => {
                                      const selectedUserId =
                                        event.target.value;
                                      if (!selectedUserId) {
                                        return;
                                      }
                                      void handleAssign(
                                        row.activity_id,
                                        selectedUserId,
                                      );
                                    }}
                                    className="rounded-md border border-zinc-300 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-200 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
                                  >
                                    <option value="" disabled>
                                      {isSavingAssign
                                        ? "Saving..."
                                        : "Assign to..."}
                                    </option>
                                    {engineers.map((engineer) => (
                                      <option
                                        key={engineer.user_id}
                                        value={engineer.user_id}
                                      >
                                        {engineer.name}
                                      </option>
                                    ))}
                                  </select>
                                  {assignError && (
                                    <p className="text-xs text-red-600 dark:text-red-400">
                                      {assignError}
                                    </p>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
                                  {assignment.name}
                                </span>
                                <button
                                  type="button"
                                  disabled={isSavingAssign}
                                  onClick={() =>
                                    setReassigningActivityIds((current) => {
                                      const next = new Set(current);
                                      next.add(row.activity_id);
                                      return next;
                                    })
                                  }
                                  className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#54B5FB] dark:bg-white dark:text-[#54B5FB] dark:hover:bg-[#54B5FB]/10"
                                >
                                  Reassign
                                </button>
                                {assignError && (
                                  <p className="w-full text-xs text-red-600 dark:text-red-400">
                                    {assignError}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3">
                        {(() => {
                          const status = row.activities?.status ?? null;
                          const category = getStatusCategory(status);
                          const isActionLoading = actionActivityId === row.id;

                          if (
                            row.was_completed ||
                            category === "completed"
                          ) {
                            return (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
                                Completed
                              </span>
                            );
                          }

                          if (category === "in_progress") {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMarkComplete(
                                    row.id,
                                    row.activity_id,
                                  )
                                }
                                disabled={isActionLoading}
                                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
                              >
                                {isActionLoading
                                  ? "Saving..."
                                  : "Mark Complete"}
                              </button>
                            );
                          }

                          if (
                            category === "not_started" ||
                            status === "Not Started"
                          ) {
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMarkInProgress(
                                    row.id,
                                    row.activity_id,
                                  )
                                }
                                disabled={isActionLoading}
                                className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-zinc-50"
                              >
                                {isActionLoading
                                  ? "Saving..."
                                  : "Mark In Progress"}
                              </button>
                            );
                          }

                          return (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              —
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-zinc-200 px-6 py-4 dark:border-zinc-200">
              {showCloseConfirm ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-200 dark:bg-amber-50">
                  <p className="text-sm text-amber-900 dark:text-amber-900">
                    Close this session? PPC will be recorded as{" "}
                    {livePpc.toFixed(1)}%
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCloseSession()}
                      disabled={isClosing}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
                    >
                      {isClosing ? "Closing..." : "Confirm Close"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCloseConfirm(false)}
                      disabled={isClosing}
                      className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block">
                  <button
                    type="button"
                    onClick={handleCloseSessionClick}
                    disabled={isClosing}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
                  >
                    Close Session
                  </button>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <section className="space-y-6">
          <div className={`${PLANNING_FLOATING_CARD_CLASS} px-6 py-5`}>
            <p className="text-sm text-zinc-700 dark:text-zinc-500">
              No active planning session. Start a new 14-day session to begin
              tracking PPC.
            </p>
          </div>

          <div className={`${PLANNING_FLOATING_CARD_CLASS} p-6`}>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
              Start New Session
            </h2>

            <div className="mt-4 max-w-xs">
              <label
                htmlFor="session-start-date"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Start date
              </label>
              <input
                id="session-start-date"
                type="date"
                min={minStartDate}
                value={startDateInput}
                onChange={(event) =>
                  handleStartDateChange(event.target.value)
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-zinc-200 dark:bg-white dark:text-zinc-900"
              />
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                {startDateHint}
              </p>
            </div>

            <div className="mt-6">
              {isPreviewLoading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-500">
                  Loading activity preview...
                </p>
              ) : previewActivities.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-200 dark:bg-amber-50 dark:text-amber-900">
                  No activities found in this date range. Try a different start
                  date.
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-900">
                    {previewActivities.length} activit
                    {previewActivities.length === 1 ? "y" : "ies"} will be
                    committed to this session
                  </p>
                  <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-200 dark:bg-zinc-50">
                    {previewActivities.map((activity) => (
                      <li
                        key={activity.activity_id}
                        className="text-zinc-700 dark:text-zinc-500"
                      >
                        <span className="font-mono text-xs">
                          {activity.activity_id}
                        </span>{" "}
                        — {activity.activity_name}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleStartSession()}
              disabled={
                isStarting || isPreviewLoading || previewActivities.length === 0
              }
              className="mt-6 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]"
            >
              {isStarting ? "Starting..." : "Start Session"}
            </button>
          </div>
        </section>
      )}

      <section className={`${PLANNING_SAGE_CARD_CLASS} p-6`}>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
          PPC History
        </h2>

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-500">
            Loading PPC history...
          </p>
        ) : closedSessions.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-500">
            No completed sessions yet. Close your first session to see PPC
            history.
          </p>
        ) : (
          <>
            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-zinc-200"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={chartData.length > 3 ? -20 : 0}
                    textAnchor={chartData.length > 3 ? "end" : "middle"}
                    height={chartData.length > 3 ? 60 : 30}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip content={<PpcChartTooltip />} />
                  <Bar dataKey="ppc" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={getPpcColorClasses(entry.ppc).bar}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className={`mt-8 overflow-x-auto ${PLANNING_TABLE_CARD_CLASS}`}>
              <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Session Period
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Total
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Completed
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      PPC %
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Closed Date
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Variance Reasons
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-200">
                  {closedSessions.map((session) => {
                    const activities = session.session_activities ?? [];
                    const total = activities.length;
                    const completed = activities.filter(
                      (row) => row.was_completed,
                    ).length;
                    const ppc =
                      session.ppc_score !== null &&
                      session.ppc_score !== undefined
                        ? Number(session.ppc_score)
                        : calculatePpc(completed, total);
                    const varianceBreakdown = formatVarianceBreakdown(activities);

                    return (
                      <tr key={session.id} className="align-top">
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-500">
                          {formatSessionRange(
                            session.start_date,
                            session.end_date,
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-500">
                          {total}
                        </td>
                        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-500">
                          {completed}
                        </td>
                        <td className="px-4 py-3">
                          <PpcBadge ppc={ppc} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-500">
                          {formatDateTime(session.closed_at)}
                        </td>
                        <td className="px-4 py-3">
                          {varianceBreakdown.length === 0 ? (
                            <span className="text-zinc-400 dark:text-zinc-500">
                              —
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {varianceBreakdown.map((entry) => (
                                <span
                                  key={entry.reason}
                                  className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700"
                                >
                                  {entry.reason} ×{entry.count}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void handleOpenSessionDetail(session)}
                            className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-zinc-50"
                          >
                            See Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {detailSession && (
        <SessionDetailModal
          session={detailSession}
          activities={sessionDetailActivities}
          isLoading={isLoadingDetail}
          errorMessage={sessionDetailError}
          onClose={handleCloseSessionDetail}
        />
      )}

      {showVarianceModal && (
        <VarianceCloseModal
          incompleteActivities={incompleteActivities}
          varianceReasons={varianceReasons}
          otherReasons={otherReasons}
          isClosing={isClosing}
          errorMessage={varianceModalError}
          allReasonsSelected={allVarianceReasonsSelected}
          onReasonChange={handleVarianceReasonChange}
          onOtherReasonChange={handleOtherReasonChange}
          onConfirm={() => void handleConfirmVarianceClose()}
          onCancel={handleCancelVarianceModal}
        />
      )}
    </PlanningPageShell>
  );
}
