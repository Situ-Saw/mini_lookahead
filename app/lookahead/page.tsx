"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LookaheadActivity } from "@/lib/lookahead";

const DEFAULT_LOOKAHEAD_DAYS = 14;
const MIN_LOOKAHEAD_DAYS = 1;
const MAX_LOOKAHEAD_DAYS = 99;

type SortField = "start_date" | "finish_date";
type SortDirection = "asc" | "desc";

function clampLookaheadDays(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_LOOKAHEAD_DAYS;
  return Math.min(MAX_LOOKAHEAD_DAYS, Math.max(MIN_LOOKAHEAD_DAYS, value));
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isDateWithinRange(
  value: string | null,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const date = parseDateOnly(value);
  if (!date) return false;

  return date >= rangeStart && date <= rangeEnd;
}

function isUpcomingActivity(
  activity: LookaheadActivity,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  return (
    isDateWithinRange(activity.start_date, rangeStart, rangeEnd) ||
    isDateWithinRange(activity.finish_date, rangeStart, rangeEnd)
  );
}

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

function formatDuration(value: number | string | null): string {
  if (value === null || value === "") return "—";
  return String(value);
}

function parseSortableDate(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;

  return new Date(year, month - 1, day).getTime();
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
      {isActive && <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

export default function LookaheadPage() {
  const [activities, setActivities] = useState<LookaheadActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lookaheadDays, setLookaheadDays] = useState(DEFAULT_LOOKAHEAD_DAYS);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("start_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    document.title = "Look Ahead Planner";
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadActivities() {
      setIsLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from("activities")
        .select(
          "activity_id, activity_name, status, wbs_code, start_date, finish_date, duration",
        )
        .order("start_date", { ascending: true, nullsFirst: false });

      if (!isMounted) return;

      if (error) {
        setFetchError(error.message);
        setActivities([]);
      } else {
        setActivities((data ?? []) as LookaheadActivity[]);
      }

      setIsLoading(false);
    }

    void loadActivities();

    return () => {
      isMounted = false;
    };
  }, []);

  const upcomingActivities = useMemo(() => {
    const today = startOfToday();
    const horizonEnd = addDays(today, lookaheadDays);

    return activities.filter((activity) =>
      isUpcomingActivity(activity, today, horizonEnd),
    );
  }, [activities, lookaheadDays]);

  const filteredActivities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return upcomingActivities;

    return upcomingActivities.filter((activity) => {
      const activityId = activity.activity_id.toLowerCase();
      const activityName = (activity.activity_name ?? "").toLowerCase();
      return activityId.includes(query) || activityName.includes(query);
    });
  }, [searchQuery, upcomingActivities]);

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

  const handleLookaheadDaysChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { value } = event.target;

    if (value === "") {
      setLookaheadDays(MIN_LOOKAHEAD_DAYS);
      return;
    }

    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;

    setLookaheadDays(clampLookaheadDays(parsed));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("asc");
  };

  if (fetchError) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Look Ahead Planner
        </h1>
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          Failed to load activities: {fetchError}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Look Ahead Planner
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Construction schedule overview for the next {lookaheadDays} days.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <label
            htmlFor="lookahead-days"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Look Ahead Days
          </label>
          <input
            id="lookahead-days"
            type="number"
            inputMode="numeric"
            value={lookaheadDays}
            onChange={handleLookaheadDaysChange}
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-center text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Total Activities
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {isLoading ? "—" : activities.length.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Upcoming Activities ({lookaheadDays} Days)
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-blue-900 dark:text-blue-100">
            {isLoading ? "—" : upcomingActivities.length.toLocaleString()}
          </p>
        </div>
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
      ) : upcomingActivities.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No upcoming activities in the next {lookaheadDays} days.
        </p>
      ) : sortedActivities.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No activities match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Activity ID
                </th>
                <th className="min-w-[12rem] px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Activity Name
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Status
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
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {sortedActivities.map((activity) => (
                <tr
                  key={activity.activity_id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {activity.activity_id}
                  </td>
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {activity.activity_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={activity.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {activity.wbs_code ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatDate(activity.start_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatDate(activity.finish_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {formatDuration(activity.duration)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
