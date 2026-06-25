"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  activity_id: string;
  activity_name: string;
  status: string | null;
  wbs_code: string | null;
  start_date: string | null;
  finish_date: string | null;
  duration: number | string | null;
  act_start_date: string | null;
  act_end_date: string | null;
  act_duration: number | string | null;
  progress: number | string | null;
  delay_days: number | string | null;
  responsible_engineer: string | null;
};

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

function ActivitiesTable({ activities }: { activities: Activity[] }) {
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
              <th className="min-w-[10rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Responsible Engineer
              </th>
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
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.responsible_engineer)}
                </td>
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

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActivityFilter>("all");
  const [sortField, setSortField] = useState<SortField>("start_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    document.title = "Activity Master";
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadActivities() {
      setIsLoading(true);
      setFetchError(null);

      const { data, error } = await supabase
        .from("activities")
        .select(
          "activity_id, activity_name, wbs_code, status, start_date, finish_date, duration, act_start_date, act_end_date, act_duration, progress, delay_days, responsible_engineer",
        )
        .order("activity_id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setFetchError(error.message);
        setActivities([]);
      } else {
        setActivities((data ?? []) as Activity[]);
      }

      setIsLoading(false);
    }

    void loadActivities();

    return () => {
      isMounted = false;
    };
  }, []);

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
        <ActivitiesTable activities={sortedActivities} />
      )}
    </main>
  );
}
