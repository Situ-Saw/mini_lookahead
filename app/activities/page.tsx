"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Activity = {
  activity_id: string;
  activity_name: string;
  status: string | null;
  wbs_code: string | null;
  start_date: string | null;
  finish_date: string | null;
  duration: number | string | null;
  progress: number | string | null;
  responsible_engineer: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
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

function getProgressBarColor(progress: number): string {
  if (progress === 0) return "bg-zinc-400 dark:bg-zinc-500";
  if (progress < 50) return "bg-amber-400 dark:bg-amber-500";
  if (progress < 100) return "bg-blue-500 dark:bg-blue-400";
  return "bg-emerald-500 dark:bg-emerald-400";
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

function EditProgressModal({
  activity,
  isSaving,
  saveError,
  onCancel,
  onSave,
}: {
  activity: Activity;
  isSaving: boolean;
  saveError: string | null;
  onCancel: () => void;
  onSave: (progress: number) => void;
}) {
  const [progress, setProgress] = useState(() =>
    normalizeProgress(activity.progress),
  );

  useEffect(() => {
    setProgress(normalizeProgress(activity.progress));
  }, [activity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={isSaving ? undefined : onCancel}
        disabled={isSaving}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-progress-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="edit-progress-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          Update Progress
        </h2>

        <div className="mt-4 space-y-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-900/60">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Activity ID
          </p>
          <p className="font-mono text-sm text-zinc-900 dark:text-zinc-100">
            {activity.activity_id}
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Activity Name
          </p>
          <p className="text-sm text-zinc-900 dark:text-zinc-100">
            {activity.activity_name}
          </p>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Progress: {progress}%
          </p>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={progress}
            disabled={isSaving}
            onChange={(event) =>
              setProgress(Number.parseInt(event.target.value, 10))
            }
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800"
          />
          <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {saveError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {saveError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(progress)}
            disabled={isSaving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivitiesTable({
  activities,
  onEditClick,
}: {
  activities: Activity[];
  onEditClick: (activity: Activity) => void;
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
              <th className="min-w-[10rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Progress
              </th>
              <th className="min-w-[10rem] whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Responsible Engineer
              </th>
              <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                Actions
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
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.status)}
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
                  {formatCell(activity.duration)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ProgressBar progress={normalizeProgress(activity.progress)} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                  {formatCell(activity.responsible_engineer)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEditClick(activity)}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Edit
                  </button>
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
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
          "activity_id, activity_name, status, wbs_code, start_date, finish_date, duration, progress, responsible_engineer",
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

  const handleEditClick = useCallback((activity: Activity) => {
    setSaveError(null);
    setEditingActivity(activity);
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (isSaving) return;
    setEditingActivity(null);
    setSaveError(null);
  }, [isSaving]);

  const handleSaveProgress = useCallback(
    async (progress: number) => {
      if (!editingActivity) return;

      const normalizedProgress = normalizeProgress(progress);

      setIsSaving(true);
      setSaveError(null);

      const { error } = await supabase
        .from("activities")
        .update({ progress: normalizedProgress })
        .eq("activity_id", editingActivity.activity_id);

      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }

      setActivities((current) =>
        current.map((activity) =>
          activity.activity_id === editingActivity.activity_id
            ? { ...activity, progress: normalizedProgress }
            : activity,
        ),
      );

      setIsSaving(false);
      setEditingActivity(null);
      setSaveError(null);
    },
    [editingActivity],
  );

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
            : `${activities.length} ${activities.length === 1 ? "activity" : "activities"}`}
        </p>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          Loading activities...
        </p>
      ) : activities.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No activities found
        </p>
      ) : (
        <ActivitiesTable
          activities={activities}
          onEditClick={handleEditClick}
        />
      )}

      {editingActivity && (
        <EditProgressModal
          activity={editingActivity}
          isSaving={isSaving}
          saveError={saveError}
          onCancel={handleCancelEdit}
          onSave={handleSaveProgress}
        />
      )}
    </main>
  );
}
