"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

type PlanningSession = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
};

type SessionCommittedActivity = {
  activity_id: string;
  was_completed: boolean;
  activity_name: string;
  status: string | null;
  finish_date: string | null;
  wbs_code: string | null;
};

type StatusCategory = "not_started" | "in_progress" | "completed" | "other";

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  return date;
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

function getStatusCategory(
  status: string | null,
  wasCompleted: boolean,
): StatusCategory {
  if (wasCompleted) return "completed";
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

function getStatusLabel(category: StatusCategory, status: string | null): string {
  switch (category) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    default:
      return status ?? "Unknown";
  }
}

function StatusBadge({
  status,
  wasCompleted,
}: {
  status: string | null;
  wasCompleted: boolean;
}) {
  const category = getStatusCategory(status, wasCompleted);
  const label = getStatusLabel(category, status);

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

function getCardBorderClass(category: StatusCategory): string {
  switch (category) {
    case "completed":
      return "border-l-emerald-500 dark:border-l-emerald-400";
    case "in_progress":
      return "border-l-blue-500 dark:border-l-blue-400";
    default:
      return "border-l-zinc-400 dark:border-l-zinc-500";
  }
}

function normalizeSessionActivity(
  row: Record<string, unknown>,
): SessionCommittedActivity | null {
  const activities = row.activities;
  const activity =
    Array.isArray(activities) && activities.length > 0
      ? (activities[0] as Record<string, unknown>)
      : (activities as Record<string, unknown> | null);

  if (!activity) return null;

  return {
    activity_id: String(row.activity_id),
    was_completed: Boolean(row.was_completed),
    activity_name: String(activity.activity_name ?? ""),
    status: (activity.status as string | null) ?? null,
    finish_date: (activity.finish_date as string | null) ?? null,
    wbs_code: (activity.wbs_code as string | null) ?? null,
  };
}

function ActivityCard({ activity }: { activity: SessionCommittedActivity }) {
  const category = getStatusCategory(activity.status, activity.was_completed);
  const isCompleted = category === "completed";
  const borderClass = getCardBorderClass(category);

  return (
    <article
      className={`rounded-xl border border-zinc-200 border-l-4 bg-white p-4 shadow-sm transition-colors dark:border-zinc-800 dark:bg-zinc-950 ${borderClass} ${
        isCompleted ? "opacity-75" : ""
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {activity.activity_id}
          </p>
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {activity.activity_name}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            WBS: {activity.wbs_code ?? "—"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Planned Finish
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {formatDate(activity.finish_date)}
            </p>
          </div>

          <StatusBadge
            status={activity.status}
            wasCompleted={activity.was_completed}
          />
        </div>
      </div>
    </article>
  );
}

export default function LookaheadPage() {
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const [activeSession, setActiveSession] = useState<PlanningSession | null>(
    null,
  );
  const [activities, setActivities] = useState<SessionCommittedActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Look Ahead";
  }, []);

  const loadData = useCallback(
    async (options?: { isRefresh?: boolean }) => {
    if (!activeProject) return;

    if (options?.isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);

    const { data: sessionData, error: sessionError } = await supabase
      .from("planning_sessions")
      .select("id, start_date, end_date, status")
      .eq("project_id", activeProject.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      setFetchError(sessionError.message);
      setActiveSession(null);
      setActivities([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const session = sessionData as PlanningSession | null;
    setActiveSession(session);

    if (!session) {
      setActivities([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from("session_activities")
      .select(
        `
        activity_id,
        was_completed,
        activities (
          activity_name,
          status,
          finish_date,
          wbs_code
        )
      `,
      )
      .eq("session_id", session.id);

    if (error) {
      setFetchError(error.message);
      setActivities([]);
    } else {
      const normalized = (data ?? [])
        .map((row) => normalizeSessionActivity(row as Record<string, unknown>))
        .filter((row): row is SessionCommittedActivity => row !== null)
        .sort((left, right) => {
          const leftDate = parseDateOnly(left.finish_date);
          const rightDate = parseDateOnly(right.finish_date);

          if (!leftDate && !rightDate) {
            return left.activity_id.localeCompare(right.activity_id);
          }
          if (!leftDate) return 1;
          if (!rightDate) return -1;

          return leftDate.getTime() - rightDate.getTime();
        });

      setActivities(normalized);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  },
    [activeProject],
  );

  useEffect(() => {
    if (!activeProject) return;
    void loadData();
  }, [loadData, activeProject]);

  const remainingCount = useMemo(
    () => activities.filter((activity) => !activity.was_completed).length,
    [activities],
  );

  if (isProjectLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading project"
        />
      </main>
    );
  }

  if (!activeProject) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            No project selected.
            <br />
            Please select a project to continue.
          </p>
          <Link
            href="/select-project"
            className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Select Project
          </Link>
        </div>
      </main>
    );
  }

  if (fetchError && isLoading) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Look Ahead
        </h1>
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          Failed to load look ahead data: {fetchError}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Look Ahead
        </h1>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {activeProject.code} — {activeProject.name}
          </span>
        </p>

        {activeSession && !isLoading && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Active session: {formatDate(activeSession.start_date)} →{" "}
            {formatDate(activeSession.end_date)}
          </p>
        )}

        {!activeSession && !isLoading && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Activities from the active planning session appear here.
          </p>
        )}
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {fetchError}
        </p>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          Loading look ahead data...
        </div>
      ) : !activeSession ? (
        <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white px-8 py-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            No tasks scheduled for this week. Check back later or ask your
            supervisor for the latest work plan.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Total Activities
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {activities.length.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Remaining Activities
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-blue-900 dark:text-blue-100">
                {remainingCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => void loadData({ isRefresh: true })}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {activities.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              No tasks assigned yet. Ask your supervisor to update the weekly
              work plan.
            </p>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <ActivityCard key={activity.activity_id} activity={activity} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
