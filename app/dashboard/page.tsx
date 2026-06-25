"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";

const MS_PER_DAY = 86_400_000;

type DashboardStats = {
  totalActivities: number;
  completedActivities: number;
  inProgressActivities: number;
  notStartedActivities: number;
  delayedActivities: number;
  earlyActivities: number;
  averageDelayDays: number | null;
  baselineCount: number;
  totalConstraints: number;
  openConstraints: number;
  closedConstraints: number;
  netDelayDays: number | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  projectedEndDate: string | null;
  plannedDurationDays: number | null;
  projectedDurationDays: number | null;
};

type ActivityRow = {
  status: string | null;
  start_date: string | null;
  finish_date: string | null;
  act_start_date: string | null;
  act_end_date: string | null;
  delay_days: number | null;
  is_baseline: boolean | null;
};

type ConstraintRow = {
  status: string | null;
};

type KpiVariant = "neutral" | "green" | "blue" | "gray" | "amber" | "red";

function parseDateOnly(value: string): Date | null {
  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDisplayDate(value: string | null): string {
  if (!value) return "—";

  const date = parseDateOnly(value);
  if (!date) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateToIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function differenceInCalendarDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function calculatePpc(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 1000) / 10;
}

function getPpcColorClasses(ppc: number): {
  text: string;
  bar: string;
  stroke: string;
  gradient: string;
} {
  if (ppc >= 100) {
    return {
      text: "text-emerald-600 dark:text-emerald-400",
      bar: "bg-emerald-500 dark:bg-emerald-400",
      stroke: "stroke-emerald-500 dark:stroke-emerald-400",
      gradient:
        "from-emerald-50 via-white to-white dark:from-emerald-950/40 dark:via-zinc-950 dark:to-zinc-950",
    };
  }
  if (ppc >= 71) {
    return {
      text: "text-blue-600 dark:text-blue-400",
      bar: "bg-blue-500 dark:bg-blue-400",
      stroke: "stroke-blue-500 dark:stroke-blue-400",
      gradient:
        "from-blue-50 via-white to-white dark:from-blue-950/40 dark:via-zinc-950 dark:to-zinc-950",
    };
  }
  if (ppc >= 41) {
    return {
      text: "text-amber-600 dark:text-amber-400",
      bar: "bg-amber-400 dark:bg-amber-500",
      stroke: "stroke-amber-500 dark:stroke-amber-400",
      gradient:
        "from-amber-50 via-white to-white dark:from-amber-950/40 dark:via-zinc-950 dark:to-zinc-950",
    };
  }
  return {
    text: "text-red-600 dark:text-red-400",
    bar: "bg-red-500 dark:bg-red-400",
    stroke: "stroke-red-500 dark:stroke-red-400",
    gradient:
      "from-red-50 via-white to-white dark:from-red-950/40 dark:via-zinc-950 dark:to-zinc-950",
  };
}

function getPpcInterpretation(ppc: number): string {
  if (ppc >= 100) return "Project Complete";
  if (ppc >= 91) return "Near Completion - Final push";
  if (ppc >= 71) return "On Track - Monitor closely";
  if (ppc >= 41) return "Behind Schedule - Review constraints";
  return "Critical - Immediate attention required";
}

function isCompleted(activity: ActivityRow): boolean {
  return activity.status === "Completed" || activity.act_end_date !== null;
}

function isInProgress(activity: ActivityRow): boolean {
  return activity.act_start_date !== null && activity.act_end_date === null;
}

function isNotStarted(activity: ActivityRow): boolean {
  return activity.act_start_date === null && activity.status !== "Completed";
}

function computeStats(
  activities: ActivityRow[],
  constraints: ConstraintRow[],
): DashboardStats {
  let completedActivities = 0;
  let inProgressActivities = 0;
  let notStartedActivities = 0;
  let delayedActivities = 0;
  let earlyActivities = 0;
  let baselineCount = 0;
  let netDelayDays = 0;
  let hasDelayData = false;
  let plannedStartDate: string | null = null;
  let plannedEndDate: string | null = null;
  const positiveDelays: number[] = [];

  for (const activity of activities) {
    if (isCompleted(activity)) completedActivities += 1;
    if (isInProgress(activity)) inProgressActivities += 1;
    if (isNotStarted(activity)) notStartedActivities += 1;

    const delayDays =
      activity.delay_days === null || activity.delay_days === undefined
        ? null
        : Number(activity.delay_days);

    if (delayDays !== null && !Number.isNaN(delayDays)) {
      netDelayDays += delayDays;
      hasDelayData = true;

      if (delayDays > 0) {
        delayedActivities += 1;
        positiveDelays.push(delayDays);
      } else if (delayDays < 0) {
        earlyActivities += 1;
      }
    }

    if (activity.start_date) {
      if (!plannedStartDate || activity.start_date < plannedStartDate) {
        plannedStartDate = activity.start_date;
      }
    }

    if (activity.finish_date) {
      if (!plannedEndDate || activity.finish_date > plannedEndDate) {
        plannedEndDate = activity.finish_date;
      }
    }

    if (activity.is_baseline === true) {
      baselineCount += 1;
    }
  }

  let openConstraints = 0;
  let closedConstraints = 0;

  for (const constraint of constraints) {
    if (constraint.status === "Open") openConstraints += 1;
    else if (constraint.status === "Closed") closedConstraints += 1;
  }

  const averageDelayDays =
    positiveDelays.length > 0
      ? Math.round(
          (positiveDelays.reduce((sum, value) => sum + value, 0) /
            positiveDelays.length) *
            10,
        ) / 10
      : null;

  const parsedPlannedStart = plannedStartDate
    ? parseDateOnly(plannedStartDate)
    : null;
  const parsedPlannedEnd = plannedEndDate
    ? parseDateOnly(plannedEndDate)
    : null;

  let plannedDurationDays: number | null = null;
  let projectedEndDate: string | null = null;
  let projectedDurationDays: number | null = null;

  if (parsedPlannedStart && parsedPlannedEnd) {
    plannedDurationDays = differenceInCalendarDays(
      parsedPlannedEnd,
      parsedPlannedStart,
    );
  }

  if (parsedPlannedEnd) {
    const netDelay = hasDelayData ? netDelayDays : 0;
    projectedEndDate = dateToIsoDate(addDaysToDate(parsedPlannedEnd, netDelay));

    if (plannedDurationDays !== null) {
      projectedDurationDays = plannedDurationDays + netDelay;
    }
  }

  return {
    totalActivities: activities.length,
    completedActivities,
    inProgressActivities,
    notStartedActivities,
    delayedActivities,
    earlyActivities,
    averageDelayDays,
    baselineCount,
    totalConstraints: constraints.length,
    openConstraints,
    closedConstraints,
    netDelayDays: hasDelayData ? netDelayDays : null,
    plannedStartDate,
    plannedEndDate,
    projectedEndDate,
    plannedDurationDays,
    projectedDurationDays,
  };
}

const VARIANT_STYLES: Record<
  KpiVariant,
  {
    card: string;
    border: string;
    label: string;
    value: string;
    icon: string;
  }
> = {
  neutral: {
    card: "bg-white dark:bg-zinc-950",
    border: "border-l-zinc-400 dark:border-l-zinc-500",
    label: "text-zinc-500 dark:text-zinc-400",
    value: "text-zinc-900 dark:text-zinc-100",
    icon: "text-zinc-400 dark:text-zinc-500",
  },
  green: {
    card: "bg-emerald-50/80 dark:bg-emerald-950/20",
    border: "border-l-emerald-500 dark:border-l-emerald-400",
    label: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-100",
    icon: "text-emerald-500 dark:text-emerald-400",
  },
  blue: {
    card: "bg-blue-50/80 dark:bg-blue-950/20",
    border: "border-l-blue-500 dark:border-l-blue-400",
    label: "text-blue-700 dark:text-blue-300",
    value: "text-blue-900 dark:text-blue-100",
    icon: "text-blue-500 dark:text-blue-400",
  },
  gray: {
    card: "bg-zinc-50/80 dark:bg-zinc-900/40",
    border: "border-l-zinc-400 dark:border-l-zinc-500",
    label: "text-zinc-600 dark:text-zinc-400",
    value: "text-zinc-800 dark:text-zinc-200",
    icon: "text-zinc-400 dark:text-zinc-500",
  },
  amber: {
    card: "bg-amber-50/80 dark:bg-amber-950/20",
    border: "border-l-amber-500 dark:border-l-amber-400",
    label: "text-amber-700 dark:text-amber-300",
    value: "text-amber-900 dark:text-amber-100",
    icon: "text-amber-500 dark:text-amber-400",
  },
  red: {
    card: "bg-red-50/80 dark:bg-red-950/20",
    border: "border-l-red-500 dark:border-l-red-400",
    label: "text-red-700 dark:text-red-300",
    value: "text-red-900 dark:text-red-100",
    icon: "text-red-500 dark:text-red-400",
  },
};

function KpiSkeleton() {
  return <div className="mt-3 h-10 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />;
}

function KpiCard({
  label,
  value,
  displayValue,
  isLoading,
  variant = "neutral",
  icon: Icon,
}: {
  label: string;
  value?: number;
  displayValue?: string;
  isLoading: boolean;
  variant?: KpiVariant;
  icon: LucideIcon;
}) {
  const styles = VARIANT_STYLES[variant];
  const rendered = displayValue ?? value?.toLocaleString() ?? "—";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-zinc-200 border-l-4 p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 ${styles.card} ${styles.border}`}
    >
      <Icon
        className={`absolute right-4 top-4 h-5 w-5 ${styles.icon}`}
        aria-hidden="true"
      />
      <p className={`pr-8 text-sm font-medium ${styles.label}`}>{label}</p>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <p className={`mt-2 text-4xl font-bold tracking-tight ${styles.value}`}>
          {rendered}
        </p>
      )}
    </div>
  );
}

function TimelineCard({
  label,
  value,
  isLoading,
  variant = "neutral",
  subtext,
}: {
  label: string;
  value: string;
  isLoading: boolean;
  variant?: KpiVariant;
  subtext?: string;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`rounded-xl border border-zinc-200 border-l-4 p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 ${styles.card} ${styles.border}`}
    >
      <p className={`text-sm font-medium ${styles.label}`}>{label}</p>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <p className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${styles.value}`}>
          {value}
        </p>
      )}
      {subtext && !isLoading && (
        <p className={`mt-2 text-xs ${styles.label}`}>{subtext}</p>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {title}
      </p>
      <div className="mt-2 h-px w-full bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function CircularProgress({
  value,
  strokeClass,
}: {
  value: number;
  strokeClass: string;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      className="h-36 w-36 shrink-0 -rotate-90"
      viewBox="0 0 120 120"
      aria-hidden="true"
    >
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        strokeWidth="10"
        className="stroke-zinc-200 dark:stroke-zinc-800"
      />
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        className={strokeClass}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function getProjectedEndVariant(
  plannedEnd: string | null,
  projectedEnd: string | null,
): KpiVariant {
  if (!plannedEnd || !projectedEnd) return "neutral";

  const planned = parseDateOnly(plannedEnd);
  const projected = parseDateOnly(projectedEnd);
  if (!planned || !projected) return "neutral";

  const comparison = projected.getTime() - planned.getTime();
  if (comparison > 0) return "red";
  if (comparison < 0) return "green";
  return "neutral";
}

function getNetDelayDisplay(netDelay: number | null): {
  value: string;
  variant: KpiVariant;
  subtext: string;
} {
  if (netDelay === null) {
    return {
      value: "—",
      variant: "neutral",
      subtext: "No delay data available",
    };
  }

  if (netDelay > 0) {
    return {
      value: `+${netDelay} days`,
      variant: "red",
      subtext: "Project is running behind schedule",
    };
  }

  if (netDelay < 0) {
    return {
      value: `${netDelay} days`,
      variant: "green",
      subtext: "Project is running ahead of schedule",
    };
  }

  return {
    value: "On Track",
    variant: "green",
    subtext: "Project is on schedule",
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.title = "Project Dashboard";
  }, []);

  const loadDashboardData = useCallback(async (isMounted: () => boolean) => {
    setIsLoading(true);
    setFetchError(null);

    const [activitiesResult, constraintsResult] = await Promise.all([
      supabase
        .from("activities")
        .select(
          "status, start_date, finish_date, act_start_date, act_end_date, delay_days, is_baseline",
        ),
      supabase.from("constraints").select("status"),
    ]);

    if (!isMounted()) return;

    if (activitiesResult.error) {
      setFetchError(activitiesResult.error.message);
      setStats(null);
      setIsLoading(false);
      return;
    }

    if (constraintsResult.error) {
      setFetchError(constraintsResult.error.message);
      setStats(null);
      setIsLoading(false);
      return;
    }

    setStats(
      computeStats(
        (activitiesResult.data ?? []) as ActivityRow[],
        (constraintsResult.data ?? []) as ConstraintRow[],
      ),
    );
    setLastUpdated(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    void loadDashboardData(() => mounted);

    return () => {
      mounted = false;
    };
  }, [loadDashboardData, refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const ppc = useMemo(() => {
    if (!stats) return 0;
    return calculatePpc(stats.completedActivities, stats.totalActivities);
  }, [stats]);

  const ppcColors = getPpcColorClasses(ppc);
  const ppcInterpretation = getPpcInterpretation(ppc);

  const averageDelayDisplay =
    stats?.averageDelayDays !== null && stats?.averageDelayDays !== undefined
      ? `${stats.averageDelayDays} days`
      : "—";

  const netDelayDisplay = getNetDelayDisplay(stats?.netDelayDays ?? null);

  const projectedEndVariant = getProjectedEndVariant(
    stats?.plannedEndDate ?? null,
    stats?.projectedEndDate ?? null,
  );

  const durationBarMax = useMemo(() => {
    const planned = stats?.plannedDurationDays ?? 0;
    const projected = stats?.projectedDurationDays ?? 0;
    return Math.max(planned, projected, 1);
  }, [stats?.plannedDurationDays, stats?.projectedDurationDays]);

  const projectedDurationLonger =
    (stats?.projectedDurationDays ?? 0) > (stats?.plannedDurationDays ?? 0);

  const showBaselineBanner =
    !isLoading && stats !== null && stats.baselineCount === 0;

  return (
    <main className="min-h-full bg-zinc-50/50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-6 sm:p-10">
        {showBaselineBanner && (
          <div className="flex flex-col gap-4 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 px-6 py-5 shadow-md sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:from-amber-950/60 dark:via-amber-950/30 dark:to-amber-950/60">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-amber-200 p-3 dark:bg-amber-900/60">
                <AlertTriangle
                  className="h-6 w-6 text-amber-800 dark:text-amber-200"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  No baseline imported yet
                </p>
                <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                  Import your baseline schedule to enable PPC and delay analysis.
                </p>
              </div>
            </div>
            <Link
              href="/import"
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400"
            >
              Import Baseline
            </Link>
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white px-6 py-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900/60 dark:to-zinc-950 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Project Dashboard
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Overall project health and PPC summary
              </p>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {lastUpdated
                  ? `Last updated: ${formatLastUpdated(lastUpdated)}`
                  : "Loading..."}
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                aria-label="Refresh dashboard data"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>

        {fetchError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            Failed to load dashboard data: {fetchError}
          </p>
        )}

        <section>
          <SectionHeader title="Activity Status" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Activities"
              value={stats?.totalActivities ?? 0}
              isLoading={isLoading}
              variant="neutral"
              icon={ClipboardList}
            />
            <KpiCard
              label="Completed"
              value={stats?.completedActivities ?? 0}
              isLoading={isLoading}
              variant="green"
              icon={CheckCircle2}
            />
            <KpiCard
              label="In Progress"
              value={stats?.inProgressActivities ?? 0}
              isLoading={isLoading}
              variant="blue"
              icon={Clock}
            />
            <KpiCard
              label="Not Started"
              value={stats?.notStartedActivities ?? 0}
              isLoading={isLoading}
              variant="gray"
              icon={Circle}
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Delay Analysis" />
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Delayed Activities"
              value={stats?.delayedActivities ?? 0}
              isLoading={isLoading}
              variant="red"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Average Delay"
              displayValue={averageDelayDisplay}
              isLoading={isLoading}
              variant="amber"
              icon={Timer}
            />
            <KpiCard
              label="Running Early"
              value={stats?.earlyActivities ?? 0}
              isLoading={isLoading}
              variant="green"
              icon={TrendingUp}
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Constraints" />
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Total Constraints"
              value={stats?.totalConstraints ?? 0}
              isLoading={isLoading}
              variant="neutral"
              icon={ShieldAlert}
            />
            <KpiCard
              label="Open Constraints"
              value={stats?.openConstraints ?? 0}
              isLoading={isLoading}
              variant="amber"
              icon={ShieldX}
            />
            <KpiCard
              label="Closed Constraints"
              value={stats?.closedConstraints ?? 0}
              isLoading={isLoading}
              variant="green"
              icon={ShieldCheck}
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Overall Completion %" />
          <div
            className={`rounded-xl border border-zinc-200 bg-gradient-to-br p-6 shadow-sm dark:border-zinc-800 sm:p-8 ${ppcColors.gradient}`}
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Overall Completion %
            </h2>

            {isLoading ? (
              <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
                <div className="h-36 w-36 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-4">
                  <div className="h-16 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-center">
                <div className="relative flex items-center justify-center">
                  <CircularProgress value={ppc} strokeClass={ppcColors.stroke} />
                  <span
                    className={`absolute text-2xl font-bold ${ppcColors.text}`}
                  >
                    {ppc.toFixed(1)}%
                  </span>
                </div>

                <div className="flex-1">
                  <p
                    className={`text-6xl font-bold tracking-tight sm:text-7xl ${ppcColors.text}`}
                  >
                    {ppc.toFixed(1)}% Complete
                  </p>

                  <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${ppcColors.bar}`}
                      style={{ width: `${Math.min(ppc, 100)}%` }}
                    />
                  </div>

                  <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {ppcInterpretation}
                  </p>

                  <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                    {stats?.completedActivities ?? 0} of{" "}
                    {stats?.totalActivities ?? 0} activities completed across
                    the entire project
                  </p>

                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                    Overall project completion based on activities marked
                    complete. See Planning page for session-based PPC.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Project Timeline" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TimelineCard
              label="Planned Start"
              value={formatDisplayDate(stats?.plannedStartDate ?? null)}
              isLoading={isLoading}
              variant="neutral"
            />
            <TimelineCard
              label="Planned End"
              value={formatDisplayDate(stats?.plannedEndDate ?? null)}
              isLoading={isLoading}
              variant="neutral"
            />
            <TimelineCard
              label="Projected End Date"
              value={formatDisplayDate(stats?.projectedEndDate ?? null)}
              isLoading={isLoading}
              variant={projectedEndVariant}
            />
            <TimelineCard
              label="Net Delay Impact"
              value={netDelayDisplay.value}
              subtext={netDelayDisplay.subtext}
              isLoading={isLoading}
              variant={netDelayDisplay.variant}
            />
          </div>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {isLoading ? (
              <div className="space-y-4">
                <div className="flex justify-between">
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>
                <div className="h-4 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ) : (
              <>
                <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Planned Duration:{" "}
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {stats?.plannedDurationDays !== null &&
                      stats?.plannedDurationDays !== undefined
                        ? `${stats.plannedDurationDays} days`
                        : "—"}
                    </span>
                  </p>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Projected Duration:{" "}
                    <span
                      className={`font-bold ${
                        projectedDurationLonger
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {stats?.projectedDurationDays !== null &&
                      stats?.projectedDurationDays !== undefined
                        ? `${stats.projectedDurationDays} days`
                        : "—"}
                    </span>
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Planned</span>
                      <span>
                        {stats?.plannedDurationDays !== null &&
                        stats?.plannedDurationDays !== undefined
                          ? `${stats.plannedDurationDays} days`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
                        style={{
                          width: `${((stats?.plannedDurationDays ?? 0) / durationBarMax) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Projected</span>
                      <span>
                        {stats?.projectedDurationDays !== null &&
                        stats?.projectedDurationDays !== undefined
                          ? `${stats.projectedDurationDays} days`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          projectedDurationLonger
                            ? "bg-red-500 dark:bg-red-400"
                            : "bg-emerald-500 dark:bg-emerald-400"
                        }`}
                        style={{
                          width: `${((stats?.projectedDurationDays ?? 0) / durationBarMax) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
