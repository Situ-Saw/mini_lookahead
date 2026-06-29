"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
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
  completed_at: string | null;
  activity_name: string;
  status: string | null;
  finish_date: string | null;
  wbs_code: string | null;
  assignedName: string | null;
};

type StatusCategory = "not_started" | "in_progress" | "completed" | "other";

type ActivityConstraint = {
  id: string;
  constraint_type: string;
  description: string;
  status: string;
  target_removal_date: string | null;
};

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
    completed_at: (row.completed_at as string | null) ?? null,
    activity_name: String(activity.activity_name ?? ""),
    status: (activity.status as string | null) ?? null,
    finish_date: (activity.finish_date as string | null) ?? null,
    wbs_code: (activity.wbs_code as string | null) ?? null,
    assignedName: null,
  };
}

async function filterAndEnrichActivities(
  projectId: string,
  activities: SessionCommittedActivity[],
  currentRole: string | null,
  currentUserId: string | null,
): Promise<{
  activities: SessionCommittedActivity[];
  viewerEngineerMissing: boolean;
}> {
  if (activities.length === 0) {
    return { activities: [], viewerEngineerMissing: false };
  }

  const activityIds = activities.map((activity) => activity.activity_id);

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("activities")
    .select("activity_id, assigned_to")
    .eq("project_id", projectId)
    .in("activity_id", activityIds);

  if (assignmentError) {
    console.error(
      "Failed to load activity assignments:",
      assignmentError.message,
    );
    return { activities: [], viewerEngineerMissing: false };
  }

  const assignedToByActivity = new Map<string, string | null>();
  for (const row of assignmentData ?? []) {
    if (typeof row.activity_id === "string") {
      assignedToByActivity.set(
        row.activity_id,
        typeof row.assigned_to === "string" ? row.assigned_to : null,
      );
    }
  }

  if (currentRole === "admin" || currentRole === "planner") {
    const assignedUserIds = [
      ...new Set(
        [...assignedToByActivity.values()].filter(
          (userId): userId is string => typeof userId === "string",
        ),
      ),
    ];

    const nameByUserId: Record<string, string> = {};

    if (assignedUserIds.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", assignedUserIds);

      if (profileError) {
        console.error(
          "Failed to load assignee profiles:",
          profileError.message,
        );
      } else {
        for (const profile of profiles ?? []) {
          nameByUserId[String(profile.id)] = String(profile.name ?? "");
        }
      }
    }

    return {
      activities: activities.map((activity) => {
        const assignedTo =
          assignedToByActivity.get(activity.activity_id) ?? null;

        return {
          ...activity,
          assignedName: assignedTo
            ? (nameByUserId[assignedTo] ?? null)
            : null,
        };
      }),
      viewerEngineerMissing: false,
    };
  }

  if (currentRole === "site_engineer" && currentUserId) {
    return {
      activities: activities
        .filter(
          (activity) =>
            assignedToByActivity.get(activity.activity_id) === currentUserId,
        )
        .map((activity) => ({ ...activity, assignedName: null })),
      viewerEngineerMissing: false,
    };
  }

  if (currentRole === "viewer" && currentUserId) {
    const { data: viewerAssignment, error: viewerError } = await supabase
      .from("viewer_assignments")
      .select("engineer_id")
      .eq("viewer_id", currentUserId)
      .eq("project_id", projectId)
      .eq("is_active", true)
      .maybeSingle();

    if (viewerError) {
      console.error(
        "Failed to load viewer assignment:",
        viewerError.message,
      );
      return { activities: [], viewerEngineerMissing: false };
    }

    if (!viewerAssignment?.engineer_id) {
      return { activities: [], viewerEngineerMissing: true };
    }

    const engineerId = viewerAssignment.engineer_id;

    return {
      activities: activities
        .filter(
          (activity) =>
            assignedToByActivity.get(activity.activity_id) === engineerId,
        )
        .map((activity) => ({ ...activity, assignedName: null })),
      viewerEngineerMissing: false,
    };
  }

  return {
    activities: activities.map((activity) => ({
      ...activity,
      assignedName: null,
    })),
    viewerEngineerMissing: false,
  };
}

function ActivityCard({
  activity,
  openConstraints = [],
  showAssignedLine = false,
}: {
  activity: SessionCommittedActivity;
  openConstraints?: ActivityConstraint[];
  showAssignedLine?: boolean;
}) {
  const [showReasons, setShowReasons] = useState(false);
  const isBlocked = openConstraints.length > 0;
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
          {showAssignedLine && (
            <p
              className={
                activity.assignedName
                  ? "text-xs text-zinc-500 dark:text-zinc-400"
                  : "text-xs text-amber-600 dark:text-amber-400"
              }
            >
              {activity.assignedName
                ? `Assigned to: ${activity.assignedName}`
                : "Unassigned"}
            </p>
          )}
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

          <div className="flex flex-col items-start gap-2 sm:items-end">
            {isBlocked ? (
              <>
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900">
                  ⚠ Not Ready
                </span>
                <button
                  type="button"
                  onClick={() => setShowReasons((current) => !current)}
                  className="text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300"
                >
                  {showReasons ? "Hide reasons" : "Show reasons"}
                </button>
                {showReasons && (
                  <ul className="w-full space-y-2 sm:max-w-xs sm:text-right">
                    {openConstraints.map((constraint) => (
                      <li
                        key={constraint.id}
                        className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2 text-left dark:border-red-900/40 dark:bg-red-950/20"
                      >
                        <p className="text-xs font-semibold text-red-900 dark:text-red-200">
                          {constraint.constraint_type}
                        </p>
                        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                          {constraint.description}
                        </p>
                        {constraint.target_removal_date && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            Due: {formatDate(constraint.target_removal_date)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
                ✓ Ready
              </span>
            )}

            <StatusBadge
              status={activity.status}
              wasCompleted={activity.was_completed}
            />
          </div>
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
  const [constraintsMap, setConstraintsMap] = useState<
    Record<string, ActivityConstraint[]>
  >({});
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [viewerEngineerMissing, setViewerEngineerMissing] = useState(false);

  useEffect(() => {
    document.title = "Look Ahead";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!activeProject) {
      setIsRoleLoading(false);
      return;
    }

    const projectId = activeProject.id;
    let cancelled = false;

    async function loadRole() {
      try {
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          if (authError) {
            console.error("Failed to get current user:", authError.message);
          }
          if (!cancelled) {
            setCurrentUser(null);
            setCurrentRole("viewer");
            setIsRoleLoading(false);
          }
          return;
        }

        const { data: memberRow, error: memberError } = await supabase
          .from("project_members")
          .select("role")
          .eq("user_id", authUser.id)
          .eq("project_id", projectId)
          .maybeSingle();

        if (memberError) {
          throw new Error(memberError.message);
        }

        if (!cancelled) {
          setCurrentUser(authUser);
          setCurrentRole(memberRow?.role ?? "viewer");
          setIsRoleLoading(false);
        }
      } catch (error) {
        console.error("Failed to load user role:", error);
        if (!cancelled) {
          setCurrentUser(null);
          setCurrentRole("viewer");
          setIsRoleLoading(false);
        }
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [activeProject]);

  const showAssignedLine =
    currentRole === "admin" || currentRole === "planner";

  const loadData = useCallback(
    async (options?: { isRefresh?: boolean }) => {
    if (!activeProject || isRoleLoading) return;

    if (options?.isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setFetchError(null);
    setViewerEngineerMissing(false);

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
      setConstraintsMap({});
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const session = sessionData as PlanningSession | null;
    setActiveSession(session);

    if (!session) {
      setActivities([]);
      setConstraintsMap({});
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
        completed_at,
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
      setConstraintsMap({});
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

      const { activities: filteredActivities, viewerEngineerMissing: missingEngineer } =
        await filterAndEnrichActivities(
          activeProject.id,
          normalized,
          currentRole,
          currentUser?.id ?? null,
        );

      setViewerEngineerMissing(missingEngineer);
      setActivities(filteredActivities);

      const activityIds = filteredActivities.map(
        (activity) => activity.activity_id,
      );

      if (activityIds.length === 0) {
        setConstraintsMap({});
      } else {
        const { data: constraintsData, error: constraintsError } =
          await supabase
            .from("constraints")
            .select(
              "id, activity_id, constraint_type, description, status, target_removal_date",
            )
            .eq("project_id", activeProject.id)
            .in("activity_id", activityIds)
            .eq("status", "Open");

        if (constraintsError) {
          console.error(
            "Failed to load constraints:",
            constraintsError.message,
          );
          setConstraintsMap({});
        } else {
          const nextConstraintsMap: Record<string, ActivityConstraint[]> = {};

          for (const row of constraintsData ?? []) {
            const record = row as Record<string, unknown>;
            const activityId =
              typeof record.activity_id === "string"
                ? record.activity_id
                : String(record.activity_id ?? "");

            if (!activityId) {
              continue;
            }

            const constraint: ActivityConstraint = {
              id: String(record.id ?? ""),
              constraint_type: String(record.constraint_type ?? ""),
              description: String(record.description ?? ""),
              status: String(record.status ?? ""),
              target_removal_date:
                typeof record.target_removal_date === "string"
                  ? record.target_removal_date
                  : null,
            };

            if (!nextConstraintsMap[activityId]) {
              nextConstraintsMap[activityId] = [];
            }

            nextConstraintsMap[activityId].push(constraint);
          }

          setConstraintsMap(nextConstraintsMap);
        }
      }
    }

    setIsLoading(false);
    setIsRefreshing(false);
  },
    [activeProject, currentRole, currentUser, isRoleLoading],
  );

  useEffect(() => {
    if (!activeProject || isRoleLoading) return;
    void loadData();
  }, [loadData, activeProject, isRoleLoading]);

  const remainingCount = useMemo(
    () => activities.filter((activity) => !activity.was_completed).length,
    [activities],
  );

  const blockedCount = useMemo(
    () =>
      activities.filter(
        (activity) => (constraintsMap[activity.activity_id] ?? []).length > 0,
      ).length,
    [activities, constraintsMap],
  );

  const visibleActivities = useMemo(
    () =>
      showBlockedOnly
        ? activities.filter(
            (activity) =>
              (constraintsMap[activity.activity_id] ?? []).length > 0,
          )
        : activities,
    [activities, constraintsMap, showBlockedOnly],
  );

  const notCompletedActivities = useMemo(() => {
    const filtered = visibleActivities.filter(
      (activity) => !activity.was_completed,
    );

    return [...filtered].sort((left, right) => {
      const leftDate = parseDateOnly(left.finish_date);
      const rightDate = parseDateOnly(right.finish_date);

      if (!leftDate && !rightDate) {
        return left.activity_id.localeCompare(right.activity_id);
      }
      if (!leftDate) return 1;
      if (!rightDate) return -1;

      return leftDate.getTime() - rightDate.getTime();
    });
  }, [visibleActivities]);

  const completedActivities = useMemo(() => {
    const filtered = visibleActivities.filter(
      (activity) => activity.was_completed,
    );

    return [...filtered].sort((left, right) => {
      const leftTime = left.completed_at
        ? new Date(left.completed_at).getTime()
        : Number.NaN;
      const rightTime = right.completed_at
        ? new Date(right.completed_at).getTime()
        : Number.NaN;

      if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
        return left.activity_id.localeCompare(right.activity_id);
      }
      if (Number.isNaN(leftTime)) return 1;
      if (Number.isNaN(rightTime)) return -1;

      return rightTime - leftTime;
    });
  }, [visibleActivities]);

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

  if (fetchError && !isLoading && !activeSession && activities.length === 0) {
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

      {isLoading || isRoleLoading ? (
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
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
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

            <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Blocked Activities
              </p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-red-900 dark:text-red-100">
                {blockedCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBlockedOnly((current) => !current)}
              className={`inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                showBlockedOnly
                  ? "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              }`}
            >
              Show blocked only
            </button>
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
              {viewerEngineerMissing
                ? "No engineer assigned to your account yet."
                : currentRole === "site_engineer"
                  ? "No activities assigned to you yet for this session."
                  : "No tasks assigned yet. Ask your supervisor to update the weekly work plan."}
            </p>
          ) : visibleActivities.length === 0 ? (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              No blocked activities in this session.
            </p>
          ) : (
            <div className="space-y-8">
              <section>
                <div
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                    <span className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Remaining
                    </span>
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                      {notCompletedActivities.length}
                    </span>
                  </div>
                </div>

                {notCompletedActivities.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
                    All activities completed! 🎉
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {notCompletedActivities.map((activity) => (
                      <ActivityCard
                        key={activity.activity_id}
                        activity={activity}
                        showAssignedLine={showAssignedLine}
                        openConstraints={
                          constraintsMap[activity.activity_id] ?? []
                        }
                      />
                    ))}
                  </div>
                )}
              </section>

              {completedActivities.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowCompleted((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-left transition-colors hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        Completed
                      </span>
                      <span className="rounded-full bg-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        {completedActivities.length}
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-emerald-600 transition-transform duration-200 dark:text-emerald-400 ${
                        showCompleted ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>

                  {showCompleted && (
                    <div className="mt-3 space-y-3 border-t border-emerald-100 pt-3 dark:border-emerald-900/30">
                      {completedActivities.map((activity) => (
                        <div
                          key={activity.activity_id}
                          className="opacity-70 [&>article]:border-l-emerald-500"
                        >
                          <ActivityCard
                            activity={activity}
                            showAssignedLine={showAssignedLine}
                            openConstraints={
                              constraintsMap[activity.activity_id] ?? []
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
