"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import { displayUserId } from "@/lib/admin/credentials";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

type Activity = {
  activity_id: string;
  activity_name: string;
  status: string | null;
  assigned_to: string | null;
  wbs_code: string | null;
  start_date: string | null;
  finish_date: string | null;
  duration: number | string | null;
  act_start_date: string | null;
  act_end_date: string | null;
  act_duration: number | string | null;
  progress: number | string | null;
  delay_days: number | string | null;
};

type Engineer = {
  id: string;
  name: string;
  email: string;
};

type MyActivityFilter = "all" | "completed" | "not_completed";

type MyActivityRow = {
  id: string;
  project_id: string;
  activity_id: string;
  activity_name: string;
  status: string | null;
  progress: number;
  start_date: string | null;
  finish_date: string | null;
  delay_days: number | null;
};

function isMyActivityCompleted(activity: MyActivityRow): boolean {
  return activity.status === "Completed" || activity.progress >= 100;
}

type AssignedViewer = {
  id: string;
  viewer_id: string;
  is_active: boolean;
  name: string;
  email: string;
};

type HistoryEntry = {
  id: string;
  changed_by_name: string;
  progress_from: number | null;
  progress_to: number | null;
  status_from: string | null;
  status_to: string | null;
  changed_at: string;
};

function normalizeMyActivity(row: Record<string, unknown>): MyActivityRow | null {
  if (
    typeof row.activity_id !== "string" ||
    typeof row.activity_name !== "string"
  ) {
    return null;
  }

  const delayDays = row.delay_days;
  let parsedDelay: number | null = null;
  if (delayDays !== null && delayDays !== undefined && delayDays !== "") {
    const numeric =
      typeof delayDays === "number" ? delayDays : Number(delayDays);
    parsedDelay = Number.isNaN(numeric) ? null : numeric;
  }

  return {
    id: typeof row.id === "string" ? row.id : String(row.id ?? ""),
    project_id:
      typeof row.project_id === "string"
        ? row.project_id
        : String(row.project_id ?? ""),
    activity_id: row.activity_id,
    activity_name: row.activity_name,
    status: typeof row.status === "string" ? row.status : null,
    progress: normalizeProgress(row.progress as number | string | null),
    start_date: typeof row.start_date === "string" ? row.start_date : null,
    finish_date: typeof row.finish_date === "string" ? row.finish_date : null,
    delay_days: parsedDelay,
  };
}

function SeStatusBadge({ status }: { status: string | null }) {
  const label = status ?? "Unknown";
  const normalized = label.toLowerCase();

  const className =
    normalized === "completed"
      ? "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900"
      : normalized === "in progress"
        ? "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900"
        : "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}

function MyActivitiesTable({
  activities,
  showUpdateColumn,
  showHistoryButton,
  progressMap,
  savingMap,
  feedbackMap,
  openConstraintsMap,
  blockErrorMap,
  onProgressChange,
  onSave,
  onOpenHistory,
}: {
  activities: MyActivityRow[];
  showUpdateColumn: boolean;
  showHistoryButton: boolean;
  progressMap: Record<string, number>;
  savingMap: Record<string, boolean>;
  feedbackMap: Record<string, "saved" | "error" | null>;
  openConstraintsMap: Record<string, boolean>;
  blockErrorMap: Record<string, boolean>;
  onProgressChange: (activityId: string, progress: number) => void;
  onSave: (activity: MyActivityRow) => void;
  onOpenHistory: (activityId: string) => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const isSyncingScroll = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

  const updateTableWidth = useCallback(() => {
    if (tableRef.current) {
      setTableWidth(tableRef.current.scrollWidth);
    }
  }, []);

  useEffect(() => {
    updateTableWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateTableWidth();
    });

    if (tableRef.current) {
      resizeObserver.observe(tableRef.current);
    }

    window.addEventListener("resize", updateTableWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTableWidth);
    };
  }, [activities, updateTableWidth]);

  const handleInnerScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingScroll.current) return;

      isSyncingScroll.current = true;
      if (outerRef.current) {
        outerRef.current.scrollLeft = event.currentTarget.scrollLeft;
      }
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  const handleOuterScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingScroll.current) return;

      isSyncingScroll.current = true;
      if (innerRef.current) {
        innerRef.current.scrollLeft = event.currentTarget.scrollLeft;
      }
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  return (
    <div className="w-full rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
      <div
        ref={innerRef}
        onScroll={handleInnerScroll}
        className="w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <table
          ref={tableRef}
          className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800"
        >
        <thead className="bg-zinc-50 dark:bg-zinc-900/60">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Activity ID
            </th>
            <th className="min-w-[12rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Activity Name
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Status
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Progress
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Start Date
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Finish Date
            </th>
            <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
              Delay Days
            </th>
            {showUpdateColumn && (
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Update
              </th>
            )}
            {!showUpdateColumn && showHistoryButton && (
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
          {activities.map((activity) => {
            const isSaving = savingMap[activity.activity_id] === true;
            const feedback = feedbackMap[activity.activity_id] ?? null;
            const isBlocked = openConstraintsMap[activity.activity_id] === true;
            const currentProgress =
              progressMap[activity.activity_id] ?? activity.progress;
            const hasBlockError = blockErrorMap[activity.activity_id] === true;

            return (
              <tr
                key={activity.activity_id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {activity.activity_id}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {activity.activity_name}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <SeStatusBadge status={activity.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {progressMap[activity.activity_id] ?? activity.progress}%
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.start_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.finish_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {activity.delay_days ?? "—"}
                </td>
                {showUpdateColumn && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <div
                      className={`flex flex-col ${isBlocked ? "gap-1" : "gap-2"}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={isBlocked ? 99 : 100}
                          step={5}
                          value={currentProgress}
                          onChange={(event) => {
                            let nextValue = Number(event.target.value);
                            if (
                              isBlocked &&
                              !Number.isNaN(nextValue) &&
                              nextValue >= 100
                            ) {
                              nextValue = 99;
                            }
                            onProgressChange(activity.activity_id, nextValue);
                          }}
                          disabled={isSaving}
                          className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => onSave(activity)}
                          disabled={isSaving}
                          className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                        {showHistoryButton && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenHistory(activity.activity_id)
                            }
                            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                          >
                            History
                          </button>
                        )}
                      </div>
                      {isBlocked && currentProgress < 100 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          ⚠ Has open constraints — cannot mark 100% complete
                        </p>
                      )}
                      {hasBlockError && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          ✗ Close all constraints before marking complete
                        </p>
                      )}
                      {feedback === "saved" && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          ✓ Saved
                        </p>
                      )}
                      {feedback === "error" && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          ✗ Failed — try again
                        </p>
                      )}
                    </div>
                  </td>
                )}
                {!showUpdateColumn && showHistoryButton && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onOpenHistory(activity.activity_id)}
                      className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      History
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      <div
        ref={outerRef}
        onScroll={handleOuterScroll}
        className="sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden border-t border-zinc-200 bg-white scrollbar scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-zinc-400 scrollbar-track-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:scrollbar-track-zinc-800 dark:scrollbar-thumb-zinc-600"
      >
        <div aria-hidden="true" style={{ width: tableWidth }} className="h-px" />
      </div>
    </div>
  );
}

type SortField = "start_date" | "finish_date";
type SortDirection = "asc" | "desc";

type ActivityFilter =
  | "all"
  | "completed"
  | "in_progress"
  | "not_started"
  | "delayed"
  | "on_track";

const FILTER_OPTIONS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In Progress" },
  { value: "not_started", label: "Not Started" },
  { value: "delayed", label: "Delayed" },
  { value: "on_track", label: "On Track" },
];

function formatDate(value: string | null): string {
  if (!value) return "—";

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatHistoryDateTime(value: string): string {
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

function normalizeHistoryEntry(
  row: Record<string, unknown>,
): HistoryEntry | null {
  if (typeof row.id !== "string") {
    return null;
  }

  const profile = row.profiles as { name?: string } | null;
  const parseOptionalInt = (value: unknown): number | null => {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isNaN(numeric) ? null : numeric;
  };

  return {
    id: row.id,
    changed_by_name: profile?.name?.trim() ? profile.name : "System",
    progress_from: parseOptionalInt(row.progress_from),
    progress_to: parseOptionalInt(row.progress_to),
    status_from:
      typeof row.status_from === "string" ? row.status_from : null,
    status_to: typeof row.status_to === "string" ? row.status_to : null,
    changed_at: String(row.changed_at ?? ""),
  };
}

async function fetchActivityHistory(
  activityId: string,
  projectId: string,
): Promise<{ entries: HistoryEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from("activity_history")
    .select(
      "id, progress_from, progress_to, status_from, status_to, changed_at, profiles(name)",
    )
    .eq("activity_id", activityId)
    .eq("project_id", projectId)
    .order("changed_at", { ascending: false })
    .limit(20);

  if (error) {
    return { entries: [], error: error.message };
  }

  const entries = (data ?? [])
    .map((row) => normalizeHistoryEntry(row as Record<string, unknown>))
    .filter((row): row is HistoryEntry => row !== null);

  return { entries, error: null };
}

function ActivityHistoryPanel({
  activityId,
  entries,
  isLoading,
  error,
  onClose,
}: {
  activityId: string;
  entries: HistoryEntry[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close history panel"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-history-title"
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2
            id="activity-history-title"
            className="pr-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100"
          >
            Activity History — {activityId}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading history...
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              No history recorded for this activity yet.
            </p>
          ) : (
            <div className="relative space-y-0 pl-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-700">
              {entries.map((entry) => (
                <div key={entry.id} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[17px] top-1.5 h-3 w-3 rounded-full border-2 border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-950"
                  />
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Changed by: {entry.changed_by_name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {formatHistoryDateTime(entry.changed_at)}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {entry.progress_from !== null &&
                      entry.progress_to !== null && (
                        <p>
                          Progress: {entry.progress_from}% → {entry.progress_to}
                          %
                        </p>
                      )}
                    {entry.status_from && entry.status_to && (
                      <p>
                        Status: {entry.status_from} → {entry.status_to}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function formatCell(value: string | number | null): string {
  if (value === null || value === "") return "—";
  return String(value);
}

function normalizeProgress(value: number | string | null): number {
  if (value === null || value === "") return 0;

  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return 0;

  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function parseDelayDays(value: number | string | null): number | null {
  if (value === null || value === "") return null;

  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return null;

  return numeric;
}

function parseSortableDate(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;

  return new Date(year, month - 1, day).getTime();
}

function isCompleted(activity: Activity): boolean {
  return activity.status === "Completed" || activity.act_end_date !== null;
}

function isInProgress(activity: Activity): boolean {
  return activity.act_start_date !== null && activity.act_end_date === null;
}

function isNotStarted(activity: Activity): boolean {
  return activity.act_start_date === null && activity.status !== "Completed";
}

function isDelayed(activity: Activity): boolean {
  const delayDays = parseDelayDays(activity.delay_days);
  return delayDays !== null && delayDays > 0;
}

function isOnTrack(activity: Activity): boolean {
  const delayDays = parseDelayDays(activity.delay_days);
  return delayDays === null || delayDays <= 0;
}

function matchesFilter(activity: Activity, filter: ActivityFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return isCompleted(activity);
    case "in_progress":
      return isInProgress(activity);
    case "not_started":
      return isNotStarted(activity);
    case "delayed":
      return isDelayed(activity);
    case "on_track":
      return isOnTrack(activity);
    default:
      return true;
  }
}

function getProgressBarColor(progress: number): string {
  if (progress === 0) return "bg-zinc-400 dark:bg-zinc-500";
  if (progress < 50) return "bg-amber-400 dark:bg-amber-500";
  if (progress < 100) return "bg-blue-500 dark:bg-blue-400";
  return "bg-emerald-500 dark:bg-emerald-400";
}

type StatusCategory = "not_started" | "in_progress" | "completed" | "other";

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

function DelayBadge({ delayDays }: { delayDays: number | string | null }) {
  const parsed = parseDelayDays(delayDays);

  if (parsed === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
        —
      </span>
    );
  }

  if (parsed === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
        On Track
      </span>
    );
  }

  if (parsed > 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900">
        +{parsed} days
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900">
      {parsed} days
    </span>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const normalized = normalizeProgress(progress);
  const barColor = getProgressBarColor(normalized);

  return (
    <div className="flex min-w-[7rem] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${normalized}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
        {normalized}%
      </span>
    </div>
  );
}

function FilterButton({
  label,
  value,
  activeFilter,
  onSelect,
}: {
  label: string;
  value: ActivityFilter;
  activeFilter: ActivityFilter;
  onSelect: (filter: ActivityFilter) => void;
}) {
  const isActive = activeFilter === value;

  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </button>
  );
}

function SortButton({
  label,
  field,
  activeField,
  direction,
  onSort,
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = activeField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
      {isActive && (
        <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

function AssignActivityModal({
  activity,
  engineers,
  selectedEngineer,
  incompleteCount,
  openConstraintsCount,
  isLoadingWarnings,
  isAssigning,
  assignError,
  onSelectEngineer,
  onAssign,
  onCancel,
}: {
  activity: Activity;
  engineers: Engineer[];
  selectedEngineer: string;
  incompleteCount: number | null;
  openConstraintsCount: number | null;
  isLoadingWarnings: boolean;
  isAssigning: boolean;
  assignError: string | null;
  onSelectEngineer: (engineerId: string) => void;
  onAssign: () => void;
  onCancel: () => void;
}) {
  const isReassign = Boolean(activity.assigned_to);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={isAssigning ? undefined : onCancel}
        disabled={isAssigning}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-activity-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="assign-activity-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {isReassign ? "Reassign Activity" : "Assign Activity"}
        </h2>

        <dl className="mt-4 space-y-2 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900/60">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Activity ID</dt>
            <dd className="font-mono text-zinc-900 dark:text-zinc-100">
              {activity.activity_id}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Activity Name</dt>
            <dd className="text-right text-zinc-900 dark:text-zinc-100">
              {activity.activity_name}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
            <dd>
              <StatusBadge status={activity.status} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500 dark:text-zinc-400">
              Planned Finish Date
            </dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {formatDate(activity.finish_date)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <label
            htmlFor="assign-engineer"
            className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Select Engineer
          </label>
          <select
            id="assign-engineer"
            required
            value={selectedEngineer}
            onChange={(event) => onSelectEngineer(event.target.value)}
            disabled={isAssigning}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">Select an engineer...</option>
            {engineers.map((engineer) => (
              <option key={engineer.id} value={engineer.id}>
                {engineer.name}
              </option>
            ))}
          </select>
        </div>

        {selectedEngineer && (
          <div className="mt-4 space-y-2">
            {isLoadingWarnings ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Checking engineer workload...
              </p>
            ) : (
              <>
                {incompleteCount !== null && incompleteCount > 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠️ This engineer has {incompleteCount} incomplete{" "}
                    {incompleteCount === 1 ? "activity" : "activities"}
                  </p>
                )}
                {openConstraintsCount !== null && openConstraintsCount > 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    ⚠️ This engineer has {openConstraintsCount} open{" "}
                    {openConstraintsCount === 1 ? "constraint" : "constraints"}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {assignError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {assignError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isAssigning}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAssign}
            disabled={!selectedEngineer || isAssigning}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isAssigning ? "Assigning..." : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivitiesTable({
  activities,
  engineers,
  canManageAssignments,
  onOpenAssignModal,
  onOpenHistory,
}: {
  activities: Activity[];
  engineers: Engineer[];
  canManageAssignments: boolean;
  onOpenAssignModal: (activity: Activity) => void;
  onOpenHistory: (activityId: string) => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const isSyncingScroll = useRef(false);
  const [tableWidth, setTableWidth] = useState(0);

  const updateTableWidth = useCallback(() => {
    if (tableRef.current) {
      setTableWidth(tableRef.current.scrollWidth);
    }
  }, []);

  useEffect(() => {
    updateTableWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateTableWidth();
    });

    if (tableRef.current) {
      resizeObserver.observe(tableRef.current);
    }

    window.addEventListener("resize", updateTableWidth);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTableWidth);
    };
  }, [activities, updateTableWidth]);

  const handleInnerScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingScroll.current) return;

      isSyncingScroll.current = true;
      if (outerRef.current) {
        outerRef.current.scrollLeft = event.currentTarget.scrollLeft;
      }
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  const handleOuterScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (isSyncingScroll.current) return;

      isSyncingScroll.current = true;
      if (innerRef.current) {
        innerRef.current.scrollLeft = event.currentTarget.scrollLeft;
      }
      requestAnimationFrame(() => {
        isSyncingScroll.current = false;
      });
    },
    [],
  );

  return (
    <div className="w-full rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
      <div
        ref={innerRef}
        onScroll={handleInnerScroll}
        className="w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <table
          ref={tableRef}
          className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800"
        >
          <thead className="bg-zinc-50 dark:bg-zinc-900/60">
            <tr>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Activity ID
              </th>
              <th className="min-w-[12rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Activity Name
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Status
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Assigned To
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                WBS Code
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Start Date
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Finish Date
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Actual Start
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Actual Finish
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Delay
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Duration
              </th>
              <th className="min-w-[10rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Progress
              </th>
              {canManageAssignments && (
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
            {activities.map((activity) => (
              <tr
                key={activity.activity_id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.activity_id)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {formatCell(activity.activity_name)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={activity.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {activity.assigned_to ? (
                    (() => {
                      const engineer = engineers.find(
                        (entry) => entry.id === activity.assigned_to,
                      );
                      return engineer ? (
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {engineer.name}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          Unassigned
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      Unassigned
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.wbs_code)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.start_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.finish_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.act_start_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatDate(activity.act_end_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <DelayBadge delayDays={activity.delay_days} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.duration)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ProgressBar
                    progress={normalizeProgress(activity.progress)}
                  />
                </td>
                {canManageAssignments && (
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {activity.assigned_to ? (
                        <button
                          type="button"
                          onClick={() => onOpenAssignModal(activity)}
                          className="rounded bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:hover:bg-amber-950/50"
                        >
                          Reassign
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenAssignModal(activity)}
                          className="rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
                        >
                          Assign
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenHistory(activity.activity_id)}
                        className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        History
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        ref={outerRef}
        onScroll={handleOuterScroll}
        className="sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden border-t border-zinc-200 bg-white scrollbar scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-zinc-400 scrollbar-track-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:scrollbar-track-zinc-800 dark:scrollbar-thumb-zinc-600"
      >
        <div aria-hidden="true" style={{ width: tableWidth }} className="h-px" />
      </div>
    </div>
  );
}

function PlannerAdminActivitiesView() {
  const PAGE_SIZE = 50;
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");
  const [sortField, setSortField] = useState<SortField>("start_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [assignModal, setAssignModal] = useState<Activity | null>(null);
  const [selectedEngineer, setSelectedEngineer] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
  const [openConstraintsCount, setOpenConstraintsCount] = useState<number | null>(
    null,
  );
  const [isLoadingWarnings, setIsLoadingWarnings] = useState(false);
  const [historyActivityId, setHistoryActivityId] = useState<string | null>(
    null,
  );
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const canManageAssignments =
    activeProject?.role === "admin" || activeProject?.role === "planner";

  const handleOpenHistory = useCallback(
    async (activityId: string) => {
      if (!activeProject) {
        return;
      }

      setHistoryActivityId(activityId);
      setIsLoadingHistory(true);
      setHistoryError(null);
      setHistoryEntries([]);

      const { entries, error } = await fetchActivityHistory(
        activityId,
        activeProject.id,
      );

      setHistoryEntries(entries);
      setHistoryError(error);
      setIsLoadingHistory(false);
    },
    [activeProject],
  );

  const handleCloseHistory = useCallback(() => {
    setHistoryActivityId(null);
    setHistoryEntries([]);
    setHistoryError(null);
    setIsLoadingHistory(false);
  }, []);

  useEffect(() => {
    document.title = "Activity Master";
  }, []);

  useEffect(() => {
    if (!activeProject) return;

    const projectId = activeProject.id;
    let isMounted = true;

    async function loadActivities() {
      setIsLoading(true);
      setFetchError(null);
    
      const [activitiesResult, memberResult] = await Promise.all([
        supabase
          .from("activities")
          .select(
            "activity_id, activity_name, wbs_code, status, assigned_to, start_date, finish_date, duration, act_start_date, act_end_date, act_duration, progress, delay_days",
          )
          .eq("project_id", projectId)
          .order("activity_id", { ascending: true }),
        supabase
          .from("project_members")
          .select("user_id")
          .eq("project_id", projectId)
          .eq("role", "site_engineer"),
      ]);
    
      if (!isMounted) return;
    
      if (activitiesResult.error) {
        setFetchError(activitiesResult.error.message);
        setActivities([]);
      } else {
        setActivities((activitiesResult.data ?? []) as Activity[]);
      }
    
      const engineerIds = memberResult.data?.map((m) => m.user_id) ?? [];
    
      if (engineerIds.length > 0) {
        const { data: engineerData, error: engineerError } = await supabase
          .from("profiles")
          .select("id, name, email")
          .in("id", engineerIds)
          .order("name", { ascending: true });
    
        if (!isMounted) return;
    
        if (engineerError) {
          console.error("Engineer fetch error:", engineerError.message);
          setEngineers([]);
        } else {
          setEngineers((engineerData ?? []) as Engineer[]);
        }
      } else {
        setEngineers([]);
      }
    
      setIsLoading(false);
    }

    void loadActivities();

    return () => {
      isMounted = false;
    };
  }, [activeProject]);

  const openAssignModal = useCallback((activity: Activity) => {
    setAssignModal(activity);
    setSelectedEngineer(activity.assigned_to ?? "");
    setAssignError(null);
    setIncompleteCount(null);
    setOpenConstraintsCount(null);
  }, []);

  const closeAssignModal = useCallback(() => {
    if (isAssigning) return;
    setAssignModal(null);
    setSelectedEngineer("");
    setAssignError(null);
    setIncompleteCount(null);
    setOpenConstraintsCount(null);
  }, [isAssigning]);

  useEffect(() => {
    if (!assignModal || !selectedEngineer || !activeProject) {
      setIncompleteCount(null);
      setOpenConstraintsCount(null);
      setIsLoadingWarnings(false);
      return;
    }

    const projectId = activeProject.id;
    const engineerId = selectedEngineer;
    let isMounted = true;

    async function loadEngineerWarnings() {
      setIsLoadingWarnings(true);

      const { count: incomplete, error: incompleteError } = await supabase
        .from("activities")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to", engineerId)
        .eq("project_id", projectId)
        .neq("status", "Completed");

      if (!isMounted) return;

      if (incompleteError) {
        setIncompleteCount(null);
        setOpenConstraintsCount(null);
        setIsLoadingWarnings(false);
        return;
      }

      setIncompleteCount(incomplete ?? 0);

      const { data: assignedActivities, error: activitiesError } = await supabase
        .from("activities")
        .select("activity_id")
        .eq("assigned_to", engineerId)
        .eq("project_id", projectId);

      if (!isMounted) return;

      if (activitiesError) {
        setOpenConstraintsCount(null);
        setIsLoadingWarnings(false);
        return;
      }

      const activityIds = (assignedActivities ?? []).map(
        (row) => row.activity_id,
      );

      if (activityIds.length === 0) {
        setOpenConstraintsCount(0);
        setIsLoadingWarnings(false);
        return;
      }

      const { count: openConstraints, error: constraintsError } = await supabase
        .from("constraints")
        .select("*", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("status", "Open")
        .in("activity_id", activityIds);

      if (!isMounted) return;

      setOpenConstraintsCount(
        constraintsError ? null : (openConstraints ?? 0),
      );
      setIsLoadingWarnings(false);
    }

    void loadEngineerWarnings();

    return () => {
      isMounted = false;
    };
  }, [activeProject, assignModal, selectedEngineer]);

  const handleAssign = useCallback(async () => {
    if (!assignModal || !activeProject || !selectedEngineer) return;

    setIsAssigning(true);
    setAssignError(null);

    const selectedEngineerProfile = engineers.find(
      (engineer) => engineer.id === selectedEngineer,
    );
    const engineerName = selectedEngineerProfile?.name ?? "Unknown";
    const previousEngineer = engineers.find(
      (engineer) => engineer.id === assignModal.assigned_to,
    );
    const statusFrom = assignModal.assigned_to
      ? `Assigned to ${previousEngineer?.name ?? "Unknown"}`
      : "Unassigned";

    const { error: updateError } = await supabase
      .from("activities")
      .update({ assigned_to: selectedEngineer })
      .eq("activity_id", assignModal.activity_id)
      .eq("project_id", activeProject.id);

    if (updateError) {
      setAssignError(updateError.message);
      setIsAssigning(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: historyError } = await supabase
      .from("activity_history")
      .insert({
        activity_id: assignModal.activity_id,
        project_id: activeProject.id,
        changed_by: user?.id ?? null,
        status_from: statusFrom,
        status_to: `Assigned to ${engineerName}`,
        changed_at: new Date().toISOString(),
      });

    if (historyError) {
      setAssignError(historyError.message);
      setIsAssigning(false);
      return;
    }

    setActivities((current) =>
      current.map((activity) =>
        activity.activity_id === assignModal.activity_id
          ? { ...activity, assigned_to: selectedEngineer }
          : activity,
      ),
    );
    setAssignModal(null);
    setSelectedEngineer("");
    setAssignError(null);
    setIncompleteCount(null);
    setOpenConstraintsCount(null);
    setIsAssigning(false);
  }, [activeProject, assignModal, engineers, selectedEngineer]);

  const filteredByStatus = useMemo(
    () => activities.filter((activity) => matchesFilter(activity, activeFilter)),
    [activities, activeFilter],
  );

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredByStatus;

    return filteredByStatus.filter((activity) => {
      const activityId = activity.activity_id.toLowerCase();
      const activityName = activity.activity_name.toLowerCase();
      return activityId.includes(query) || activityName.includes(query);
    });
  }, [filteredByStatus, searchQuery]);

  const sortedActivities = useMemo(() => {
    const sorted = [...filteredActivities];

    sorted.sort((left, right) => {
      const leftValue = parseSortableDate(left[sortField]);
      const rightValue = parseSortableDate(right[sortField]);
      const comparison = leftValue - rightValue;
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [filteredActivities, sortDirection, sortField]);

  const totalPages = Math.ceil(sortedActivities.length / PAGE_SIZE);

  const paginatedActivities = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return sortedActivities.slice(start, end);
  }, [sortedActivities, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery, sortField, sortDirection]);

  const handleSort = useCallback((field: SortField) => {
    setSortField((currentField) => {
      if (currentField === field) {
        setSortDirection((currentDirection) =>
          currentDirection === "asc" ? "desc" : "asc",
        );
        return currentField;
      }

      setSortDirection("asc");
      return field;
    });
  }, []);

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

  if (fetchError) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Activity Master
        </h1>
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          Failed to load activities: {fetchError}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Activity Master
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {isLoading
            ? "Loading activities..."
            : `Showing ${sortedActivities.length} of ${activities.length} ${activities.length === 1 ? "activity" : "activities"}`}
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {activeProject.code} — {activeProject.name}
          </span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => (
          <FilterButton
            key={option.value}
            label={option.label}
            value={option.value}
            activeFilter={activeFilter}
            onSelect={setActiveFilter}
          />
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:max-w-md">
          <label
            htmlFor="activity-search"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Search activities
          </label>
          <input
            id="activity-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by Activity ID or Activity Name"
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none ring-blue-500 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Sort by:
          </span>
          <SortButton
            label="Start Date"
            field="start_date"
            activeField={sortField}
            direction={sortDirection}
            onSort={handleSort}
          />
          <SortButton
            label="Finish Date"
            field="finish_date"
            activeField={sortField}
            direction={sortDirection}
            onSort={handleSort}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          Loading activities...
        </p>
      ) : activities.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No activities found
        </p>
      ) : sortedActivities.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No activities match your search or filter.
        </p>
      ) : (
        <>
          <ActivitiesTable
            activities={paginatedActivities}
            engineers={engineers}
            canManageAssignments={canManageAssignments}
            onOpenAssignModal={openAssignModal}
            onOpenHistory={(activityId) => void handleOpenHistory(activityId)}
          />

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, sortedActivities.length)} of{" "}
                {sortedActivities.length} activities
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Previous
                </button>

                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {historyActivityId && (
        <ActivityHistoryPanel
          activityId={historyActivityId}
          entries={historyEntries}
          isLoading={isLoadingHistory}
          error={historyError}
          onClose={handleCloseHistory}
        />
      )}

      {assignModal && activeProject && (
        <AssignActivityModal
          activity={assignModal}
          engineers={engineers}
          selectedEngineer={selectedEngineer}
          incompleteCount={incompleteCount}
          openConstraintsCount={openConstraintsCount}
          isLoadingWarnings={isLoadingWarnings}
          isAssigning={isAssigning}
          assignError={assignError}
          onSelectEngineer={setSelectedEngineer}
          onAssign={() => void handleAssign()}
          onCancel={closeAssignModal}
        />
      )}
    </main>
  );
}

type UpdateProgressResponse = {
  activity?: Record<string, unknown>;
  error?: string;
};

type SessionDailyLog = {
  id: string;
  session_id: string | null;
  log_date: string;
  note: string;
  logged_by: string | null;
  created_at: string;
};

function SiteEngineerDailyLogSection({ projectId }: { projectId: string }) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [dailyLogs, setDailyLogs] = useState<SessionDailyLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [note, setNote] = useState("");
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadLogs = useCallback(async (userId: string) => {
    const { data: logsData, error: logsError } = await supabase
      .from("session_daily_logs")
      .select("*")
      .eq("logged_by", userId)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (logsError) {
      console.error("Failed to load daily logs:", logsError.message);
      setDailyLogs([]);
      return;
    }

    setDailyLogs((logsData ?? []) as SessionDailyLog[]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setIsInitializing(true);
      setSubmitError(null);

      const today = new Date().toISOString().split("T")[0];
      if (!cancelled) {
        setSelectedDate(today);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (authError || !user) {
        if (authError) {
          console.error("Failed to get current user:", authError.message);
        }
        setCurrentUserId(null);
        setDailyLogs([]);
      } else {
        setCurrentUserId(user.id);
        await loadLogs(user.id);
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from("planning_sessions")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (sessionError) {
        console.error("Failed to load active session:", sessionError.message);
        setActiveSessionId(null);
      } else {
        const sessionId =
          sessionData && typeof sessionData.id === "string"
            ? sessionData.id
            : null;
        setActiveSessionId(sessionId);
      }

      if (!cancelled) {
        setIsInitializing(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [projectId, loadLogs]);

  useEffect(() => {
    if (!submitSuccess) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setSubmitSuccess(false);
    }, 3000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [submitSuccess]);

  const handleAddLog = async () => {
    if (!currentUserId) {
      return;
    }

    if (!note.trim()) {
      setSubmitError("Please enter a note before saving.");
      setSubmitSuccess(false);
      return;
    }

    setIsAddingLog(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const { error } = await supabase.from("session_daily_logs").insert({
      session_id: activeSessionId ?? null,
      log_date: selectedDate,
      note: note.trim(),
      logged_by: currentUserId,
      created_at: new Date().toISOString(),
    });

    if (error) {
      setSubmitError(error.message);
      setIsAddingLog(false);
      return;
    }

    setNote("");
    setSelectedDate(new Date().toISOString().split("T")[0]);
    setSubmitSuccess(true);
    await loadLogs(currentUserId);
    setIsAddingLog(false);
  };

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Daily Log
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Record what happened on site today.
      </p>

      {isInitializing ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading daily log...
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div>
              <label
                htmlFor="se-log-date"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Date
              </label>
              <input
                id="se-log-date"
                type="date"
                value={selectedDate}
                disabled={isAddingLog}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full max-w-xs rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div>
              <label
                htmlFor="se-log-note"
                className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Note
              </label>
              <textarea
                id="se-log-note"
                value={note}
                disabled={isAddingLog}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="What happened on site today?"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleAddLog()}
                disabled={isAddingLog || !currentUserId || !note.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {isAddingLog ? "Adding..." : "Add Log"}
              </button>
              {submitSuccess && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Log added
                </p>
              )}
              {submitError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {submitError}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {dailyLogs.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No logs yet.
              </p>
            ) : (
              dailyLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {formatDate(log.log_date)}
                  </p>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {log.note}
                  </p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SiteEngineerMyViewersSection({
  projectId,
  engineerId,
}: {
  projectId: string;
  engineerId: string;
}) {
  const [viewers, setViewers] = useState<AssignedViewer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadViewers() {
      setIsLoading(true);
      setFetchError(null);

      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("viewer_assignments")
        .select("id, viewer_id, is_active")
        .eq("engineer_id", engineerId)
        .eq("project_id", projectId);

      if (cancelled) {
        return;
      }

      if (assignmentError) {
        setFetchError(assignmentError.message);
        setViewers([]);
        setIsLoading(false);
        return;
      }

      const rows = assignmentRows ?? [];
      const viewerIds = rows.map((row) => row.viewer_id);

      if (viewerIds.length === 0) {
        setViewers([]);
        setIsLoading(false);
        return;
      }

      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", viewerIds)
        .order("name");

      if (cancelled) {
        return;
      }

      if (profileError) {
        setFetchError(profileError.message);
        setViewers([]);
        setIsLoading(false);
        return;
      }

      const profileById = new Map(
        (profileRows ?? []).map((profile) => [profile.id, profile]),
      );

      const normalizedViewers = rows
        .map((row) => {
          const profile = profileById.get(row.viewer_id);
          if (!profile) {
            return null;
          }

          return {
            id: row.id,
            viewer_id: row.viewer_id,
            is_active: row.is_active ?? false,
            name: profile.name,
            email: profile.email,
          };
        })
        .filter((row): row is AssignedViewer => row !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      setViewers(normalizedViewers);
      setIsLoading(false);
    }

    void loadViewers();

    return () => {
      cancelled = true;
    };
  }, [engineerId, projectId]);

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        My Viewers
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Viewers assigned to your activities.
      </p>

      {isLoading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading viewers...
        </div>
      ) : fetchError ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {fetchError}
        </p>
      ) : viewers.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No viewers assigned to you yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Name
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  User ID
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {viewers.map((viewer) => (
                <tr key={viewer.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {viewer.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {displayUserId(viewer.email)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {viewer.is_active ? "Active" : "Inactive"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ActivitiesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [activities, setActivities] = useState<MyActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [feedbackMap, setFeedbackMap] = useState<
    Record<string, "saved" | "error" | null>
  >({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [viewerEngineerMissing, setViewerEngineerMissing] = useState(false);
  const [historyActivityId, setHistoryActivityId] = useState<string | null>(
    null,
  );
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [myActivityFilter, setMyActivityFilter] =
    useState<MyActivityFilter>("all");
  const [openConstraintsMap, setOpenConstraintsMap] = useState<
    Record<string, boolean>
  >({});
  const [blockErrorMap, setBlockErrorMap] = useState<Record<string, boolean>>(
    {},
  );
  const feedbackTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const blockErrorTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    async function initialize() {
      try {
        const storedProject = localStorage.getItem("active_project");
        let resolvedProjectId: string | null = null;

        if (storedProject) {
          try {
            const parsed = JSON.parse(storedProject) as { id?: string };
            resolvedProjectId = parsed.id?.trim() || null;
          } catch {
            resolvedProjectId = storedProject.trim() || null;
          }
        }

        if (!resolvedProjectId) {
          if (!cancelled) {
            setInitError("No active project selected.");
            setRoleLoading(false);
            setLoading(false);
          }
          return;
        }

        if (!cancelled) {
          setProjectId(resolvedProjectId);
        }

        const supabaseClient = createClient();
        const {
          data: { user: authUser },
          error: authError,
        } = await supabaseClient.auth.getUser();

        if (authError || !authUser) {
          router.push("/login");
          return;
        }

        if (!cancelled) {
          setUser(authUser);
        }

        setRoleLoading(true);

        const { data: memberRow, error: memberError } = await supabaseClient
          .from("project_members")
          .select("role")
          .eq("user_id", authUser.id)
          .eq("project_id", resolvedProjectId)
          .maybeSingle();

        if (memberError) {
          throw new Error(memberError.message);
        }

        let resolvedRole: string;
        if (!memberRow) {
          console.warn(
            "No project_members row found for user; defaulting role to viewer.",
          );
          resolvedRole = "viewer";
        } else {
          resolvedRole = memberRow.role;
        }

        if (!cancelled) {
          setRole(resolvedRole);
          setRoleLoading(false);
        }

        if (resolvedRole === "viewer") {
          const { data: viewerAssignment, error: viewerError } =
            await supabaseClient
              .from("viewer_assignments")
              .select("engineer_id")
              .eq("viewer_id", authUser.id)
              .eq("project_id", resolvedProjectId)
              .eq("is_active", true)
              .maybeSingle();

          if (viewerError) {
            throw new Error(viewerError.message);
          }

          if (!cancelled) {
            setViewerEngineerMissing(!viewerAssignment?.engineer_id);
          }
        } else if (!cancelled) {
          setViewerEngineerMissing(false);
        }

        const { data: activityRows, error: activitiesError } =
          await supabaseClient
            .from("activities")
            .select("*")
            .eq("project_id", resolvedProjectId);

        if (activitiesError) {
          throw new Error(activitiesError.message);
        }

        const normalizedActivities = (activityRows ?? [])
          .map((row) =>
            normalizeMyActivity(row as Record<string, unknown>),
          )
          .filter((row): row is MyActivityRow => row !== null);

        const initialProgressMap: Record<string, number> = {};
        for (const activity of normalizedActivities) {
          initialProgressMap[activity.activity_id] = activity.progress;
        }

        const activityIds = normalizedActivities.map(
          (activity) => activity.activity_id,
        );

        if (activityIds.length > 0) {
          const { data: constraintRows, error: constraintError } =
            await supabaseClient
              .from("constraints")
              .select("activity_id")
              .eq("project_id", resolvedProjectId)
              .eq("status", "Open")
              .in("activity_id", activityIds);

          if (!cancelled) {
            if (!constraintError && constraintRows) {
              const map: Record<string, boolean> = {};
              for (const row of constraintRows) {
                if (typeof row.activity_id === "string") {
                  map[row.activity_id] = true;
                }
              }
              setOpenConstraintsMap(map);
            } else if (constraintError) {
              console.error(
                "Failed to load constraints:",
                constraintError.message,
              );
              setOpenConstraintsMap({});
            }
          }
        } else if (!cancelled) {
          setOpenConstraintsMap({});
        }

        if (!cancelled) {
          setActivities(normalizedActivities);
          setProgressMap(initialProgressMap);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setInitError("Something went wrong. Please refresh the page.");
          setRoleLoading(false);
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      for (const timeoutId of Object.values(feedbackTimeoutsRef.current)) {
        clearTimeout(timeoutId);
      }
      for (const timeoutId of Object.values(blockErrorTimeoutsRef.current)) {
        clearTimeout(timeoutId);
      }
    };
  }, [router]);

  const setFeedbackWithTimeout = useCallback(
    (activityId: string, feedback: "saved" | "error" | null) => {
      const existingTimeout = feedbackTimeoutsRef.current[activityId];
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      setFeedbackMap((previous) => ({ ...previous, [activityId]: feedback }));

      if (feedback !== null) {
        feedbackTimeoutsRef.current[activityId] = setTimeout(() => {
          setFeedbackMap((previous) => ({ ...previous, [activityId]: null }));
        }, 3000);
      }
    },
    [],
  );

  const setBlockErrorWithTimeout = useCallback((activityId: string) => {
    const existingTimeout = blockErrorTimeoutsRef.current[activityId];
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    setBlockErrorMap((previous) => ({ ...previous, [activityId]: true }));

    blockErrorTimeoutsRef.current[activityId] = setTimeout(() => {
      setBlockErrorMap((previous) => ({ ...previous, [activityId]: false }));
    }, 4000);
  }, []);

  const handleProgressChange = useCallback(
    (activityId: string, progress: number) => {
      setProgressMap((previous) => ({ ...previous, [activityId]: progress }));
    },
    [],
  );

  const handleSave = useCallback(
    async (activity: MyActivityRow) => {
      if (!projectId) {
        return;
      }

      const activityId = activity.activity_id;
      const isBlocked = openConstraintsMap[activityId] === true;
      const safeProgress = progressMap[activityId] ?? activity.progress;

      if (isBlocked && safeProgress >= 100) {
        setBlockErrorWithTimeout(activityId);
        return;
      }

      const progress = safeProgress;

      setSavingMap((previous) => ({ ...previous, [activityId]: true }));
      setFeedbackMap((previous) => ({ ...previous, [activityId]: null }));

      try {
        const response = await fetch("/api/activities/update-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            activity_id: activityId,
            project_id: projectId,
            progress,
          }),
        });

        if (!response.ok) {
          setFeedbackWithTimeout(activityId, "error");
          return;
        }

        const data = (await response.json()) as UpdateProgressResponse;
        const updatedActivity = data.activity
          ? normalizeMyActivity(data.activity)
          : null;

        if (updatedActivity) {
          setActivities((previous) =>
            previous.map((row) =>
              row.activity_id === activityId ? updatedActivity : row,
            ),
          );
          setProgressMap((previous) => ({
            ...previous,
            [activityId]: updatedActivity.progress,
          }));
        }

        setFeedbackWithTimeout(activityId, "saved");
        setBlockErrorMap((previous) => ({ ...previous, [activityId]: false }));

        const existingBlockTimeout = blockErrorTimeoutsRef.current[activityId];
        if (existingBlockTimeout) {
          clearTimeout(existingBlockTimeout);
        }

        const { data: updatedConstraints, error: constraintsRefreshError } =
          await supabase
            .from("constraints")
            .select("activity_id")
            .eq("project_id", projectId)
            .eq("status", "Open")
            .eq("activity_id", activityId);

        if (!constraintsRefreshError) {
          setOpenConstraintsMap((previous) => ({
            ...previous,
            [activityId]: (updatedConstraints ?? []).length > 0,
          }));
        } else {
          console.error(
            "Failed to refresh constraints:",
            constraintsRefreshError.message,
          );
        }
      } catch {
        setFeedbackWithTimeout(activityId, "error");
      } finally {
        setSavingMap((previous) => ({ ...previous, [activityId]: false }));
      }
    },
    [
      openConstraintsMap,
      projectId,
      progressMap,
      setBlockErrorWithTimeout,
      setFeedbackWithTimeout,
    ],
  );

  const handleOpenHistory = useCallback(
    async (activityId: string) => {
      if (!projectId) {
        return;
      }

      setHistoryActivityId(activityId);
      setIsLoadingHistory(true);
      setHistoryError(null);
      setHistoryEntries([]);

      const { entries, error } = await fetchActivityHistory(
        activityId,
        projectId,
      );

      setHistoryEntries(entries);
      setHistoryError(error);
      setIsLoadingHistory(false);
    },
    [projectId],
  );

  const handleCloseHistory = useCallback(() => {
    setHistoryActivityId(null);
    setHistoryEntries([]);
    setHistoryError(null);
    setIsLoadingHistory(false);
  }, []);

  const myActivityCounts = useMemo(
    () => ({
      all: activities.length,
      completed: activities.filter((activity) =>
        isMyActivityCompleted(activity),
      ).length,
      not_completed: activities.filter(
        (activity) => !isMyActivityCompleted(activity),
      ).length,
    }),
    [activities],
  );

  const filteredMyActivities = useMemo(() => {
    if (myActivityFilter === "all") {
      return activities;
    }

    if (myActivityFilter === "completed") {
      return activities.filter((activity) => isMyActivityCompleted(activity));
    }

    return activities.filter((activity) => !isMyActivityCompleted(activity));
  }, [activities, myActivityFilter]);

  if (loading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" aria-hidden />
      </main>
    );
  }

  if (initError) {
    return (
      <main className="px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {initError}
        </div>
      </main>
    );
  }

  if (role === "planner" || role === "admin") {
    return <PlannerAdminActivitiesView />;
  }

  const isSiteEngineer = role === "site_engineer";
  const isViewer = role === "viewer";
  const showUpdateColumn = isSiteEngineer && !roleLoading;
  const showHistoryButton =
    role === "admin" || role === "planner" || role === "site_engineer";

  if (isViewer && viewerEngineerMissing) {
    return (
      <main className="px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Activities
          </h1>
        </header>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Your account has not been linked to a Site Engineer yet. Please
          contact your administrator.
        </div>
      </main>
    );
  }

  return (
    <main className="px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {isSiteEngineer ? "My Activities" : "Activities"}
        </h1>
        {isSiteEngineer && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Activities assigned to you. Update progress below.
          </p>
        )}
      </header>

      {activities.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          {isSiteEngineer
            ? "No activities have been assigned to you yet."
            : "No activities found."}
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            {(
              [
                { value: "all" as const, label: "All" },
                { value: "completed" as const, label: "Completed" },
                { value: "not_completed" as const, label: "Not Completed" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMyActivityFilter(value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  myActivityFilter === value
                    ? value === "completed"
                      ? "bg-emerald-600 text-white"
                      : value === "not_completed"
                        ? "bg-amber-500 text-white"
                        : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {label} ({myActivityCounts[value]})
              </button>
            ))}
          </div>

          {filteredMyActivities.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              No activities match this filter.
            </div>
          ) : (
            <MyActivitiesTable
              activities={filteredMyActivities}
              showUpdateColumn={showUpdateColumn}
              showHistoryButton={showHistoryButton}
              progressMap={progressMap}
              savingMap={savingMap}
              feedbackMap={feedbackMap}
              openConstraintsMap={openConstraintsMap}
              blockErrorMap={blockErrorMap}
              onProgressChange={handleProgressChange}
              onSave={(activity) => void handleSave(activity)}
              onOpenHistory={(activityId) => void handleOpenHistory(activityId)}
            />
          )}
        </>
      )}

      {historyActivityId && (
        <ActivityHistoryPanel
          activityId={historyActivityId}
          entries={historyEntries}
          isLoading={isLoadingHistory}
          error={historyError}
          onClose={handleCloseHistory}
        />
      )}

      {isSiteEngineer && projectId && user && (
        <>
          <SiteEngineerDailyLogSection projectId={projectId} />
          <SiteEngineerMyViewersSection
            projectId={projectId}
            engineerId={user.id}
          />
        </>
      )}
    </main>
  );
}
