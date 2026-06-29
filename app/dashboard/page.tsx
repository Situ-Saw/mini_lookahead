"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

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
  return activity.status === "Completed";
}

function isInProgress(activity: ActivityRow): boolean {
  return activity.status === "In Progress";
}

function isNotStarted(activity: ActivityRow): boolean {
  return activity.status === "Not Started";
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

const STATUS_BADGE_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const SCHEDULE_PILL_COLORS: Record<string, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
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
  trendText,
  trendColor,
  valueClassName,
  cardClassName,
}: {
  label: string;
  value?: number;
  displayValue?: string;
  isLoading: boolean;
  variant?: KpiVariant;
  icon: LucideIcon;
  trendText?: string;
  trendColor?: string;
  valueClassName?: string;
  cardClassName?: string;
}) {
  const styles = VARIANT_STYLES[variant];
  const rendered = displayValue ?? value?.toLocaleString() ?? "—";
  const cardBg = cardClassName ?? styles.card;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-zinc-100 p-5 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 ${cardBg}`}
    >
      <Icon
        className={`absolute right-4 top-4 h-5 w-5 ${styles.icon}`}
        aria-hidden="true"
      />
      <p className={`pr-8 text-sm font-medium ${styles.label}`}>{label}</p>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <>
          <p
            className={`mt-2 text-4xl font-bold tracking-tight ${valueClassName ?? styles.value}`}
          >
            {rendered}
          </p>
          {trendText && (
            <p className={`mt-1 text-xs font-medium ${trendColor ?? "text-zinc-500"}`}>
              {trendText}
            </p>
          )}
        </>
      )}
    </div>
  );
}

type StatusBadge = {
  label: string;
  color: "red" | "emerald" | "zinc";
};

function TimelineCard({
  label,
  value,
  isLoading,
  variant = "neutral",
  subtext,
  statusBadge,
  schedulePill,
  borderClassName,
}: {
  label: string;
  value: string;
  isLoading: boolean;
  variant?: KpiVariant;
  subtext?: string;
  statusBadge?: StatusBadge;
  schedulePill?: { label: string; color: "red" | "emerald" | "zinc" };
  borderClassName?: string;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 ${borderClassName ?? `border-zinc-200 border-l-4 ${styles.border} ${styles.card}`}`}
    >
      <p className={`text-sm font-medium ${styles.label}`}>{label}</p>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${styles.value}`}
          >
            {value}
          </p>
          {statusBadge && (
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE_COLORS[statusBadge.color]}`}
            >
              {statusBadge.label}
            </span>
          )}
          {schedulePill && (
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${SCHEDULE_PILL_COLORS[schedulePill.color]}`}
            >
              {schedulePill.label}
            </span>
          )}
        </>
      )}
      {subtext && !isLoading && (
        <p className={`mt-2 text-xs ${styles.label}`}>{subtext}</p>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  subtitle,
}: {
  title: string;
  icon?: LucideIcon;
  subtitle?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-950/40">
            <Icon
              className="h-4 w-4 text-blue-600 dark:text-blue-400"
              aria-hidden="true"
            />
          </div>
        )}
        <h2 className="text-base font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="ml-9 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </p>
      )}
      <div className="mt-3 h-px w-full bg-zinc-200 dark:bg-zinc-800" />
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
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    document.title = "Project Dashboard";
  }, []);

  const loadDashboardData = useCallback(
    async (isMounted: () => boolean, projectId: string) => {
    setIsLoading(true);
    setFetchError(null);

    const [activitiesResult, constraintsResult] = await Promise.all([
      supabase
        .from("activities")
        .select(
          "status, start_date, finish_date, delay_days, is_baseline",
        )
        .eq("project_id", projectId),
      supabase
        .from("constraints")
        .select("status")
        .eq("project_id", projectId),
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
  },
    [],
  );

  useEffect(() => {
    if (!activeProject) return;

    let mounted = true;

    void loadDashboardData(() => mounted, activeProject.id);

    return () => {
      mounted = false;
    };
  }, [loadDashboardData, refreshKey, activeProject]);

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

  const isDelayCritical = useMemo(() => {
    const total = stats?.totalActivities ?? 0;
    const delayed = stats?.delayedActivities ?? 0;
    return total > 0 && delayed > total * 0.3;
  }, [stats?.totalActivities, stats?.delayedActivities]);

  const projectedEndStatusBadge = useMemo((): StatusBadge => {
    if (projectedEndVariant === "red") {
      return { label: "DELAYED", color: "red" };
    }
    if (projectedEndVariant === "green") {
      return { label: "AHEAD", color: "emerald" };
    }
    return { label: "ON TRACK", color: "zinc" };
  }, [projectedEndVariant]);

  const netDelaySchedulePill = useMemo((): {
    label: string;
    color: "red" | "emerald" | "zinc";
  } | null => {
    const netDelay = stats?.netDelayDays ?? null;
    if (netDelay === null) return null;
    if (netDelay > 0) {
      return { label: "OVER SCHEDULE", color: "red" };
    }
    if (netDelay < 0) {
      return { label: "AHEAD OF SCHEDULE", color: "emerald" };
    }
    return { label: "ON SCHEDULE", color: "zinc" };
  }, [stats?.netDelayDays]);

  const netDelayBorderClass = useMemo(() => {
    const netDelay = stats?.netDelayDays ?? null;
    if (netDelay === null) {
      return "border-zinc-200 border-l-4 border-l-zinc-400 bg-white dark:border-zinc-800 dark:bg-zinc-950";
    }
    if (netDelay > 0) {
      return "border-2 border-red-300 bg-white dark:border-red-800 dark:bg-zinc-950";
    }
    if (netDelay < 0) {
      return "border-2 border-emerald-300 bg-white dark:border-emerald-800 dark:bg-zinc-950";
    }
    return "border-zinc-200 border-l-4 border-l-zinc-400 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40";
  }, [stats?.netDelayDays]);

  const hasDurationData =
    stats?.plannedDurationDays !== null &&
    stats?.plannedDurationDays !== undefined &&
    stats?.projectedDurationDays !== null &&
    stats?.projectedDurationDays !== undefined;

  const showBaselineBanner =
    !isLoading && stats !== null && stats.baselineCount === 0;

  if (isProjectLoading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-zinc-50/50 dark:bg-zinc-950">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading project"
        />
      </main>
    );
  }

  if (!activeProject) {
    return (
      <main className="min-h-full bg-zinc-50/50 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
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
        </div>
      </main>
    );
  }

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

        <div className="rounded-2xl bg-zinc-900 px-8 py-8 shadow-xl dark:bg-zinc-800">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Construction Planning System
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {activeProject.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300">
                  {activeProject.code}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {isLoading || !stats ? (
                  <>
                    <span className="h-6 w-28 animate-pulse rounded-full bg-zinc-700" />
                    <span className="h-6 w-24 animate-pulse rounded-full bg-zinc-700" />
                    <span className="h-6 w-32 animate-pulse rounded-full bg-zinc-700" />
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                      📅 Baseline: {formatDisplayDate(stats.plannedStartDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                      📊 {stats.totalActivities} Activities
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                      ⚠ {stats.openConstraints} Open Constraints
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                      🕐{" "}
                      {lastUpdated ? formatLastUpdated(lastUpdated) : "—"}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-3">
              {(() => {
                const health = !stats
                  ? {
                      label: "No Data",
                      cls: "bg-zinc-700 text-zinc-400 border-zinc-600",
                    }
                  : ppc >= 71
                    ? {
                        label: "On Track",
                        cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
                      }
                    : ppc >= 41
                      ? {
                          label: "At Risk",
                          cls: "bg-amber-500/20 text-amber-300 border-amber-500/30",
                        }
                      : {
                          label: "Delayed",
                          cls: "bg-red-500/20 text-red-300 border-red-500/30",
                        };
                return (
                  <span
                    className={`rounded-full border px-4 py-1.5 text-sm font-bold ${health.cls}`}
                  >
                    ● {health.label}
                  </span>
                );
              })()}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                aria-label="Refresh dashboard data"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
              <p className="text-xs text-zinc-500">
                {lastUpdated
                  ? `Updated ${formatLastUpdated(lastUpdated)}`
                  : "Loading..."}
              </p>
            </div>
          </div>
        </div>

        {fetchError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            Failed to load dashboard data: {fetchError}
          </p>
        )}

        <section>
          <SectionHeader title="Activity Status" icon={ClipboardList} />
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
              trendText={
                (stats?.completedActivities ?? 0) > 0
                  ? `↑ ${stats?.completedActivities ?? 0} done`
                  : undefined
              }
              trendColor="text-emerald-600 dark:text-emerald-400"
            />
            <KpiCard
              label="In Progress"
              value={stats?.inProgressActivities ?? 0}
              isLoading={isLoading}
              variant="blue"
              icon={Clock}
              trendText={
                (stats?.inProgressActivities ?? 0) > 0
                  ? `● ${stats?.inProgressActivities ?? 0} active`
                  : undefined
              }
              trendColor="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              label="Not Started"
              value={stats?.notStartedActivities ?? 0}
              isLoading={isLoading}
              variant="gray"
              icon={Circle}
              trendText={`${stats?.notStartedActivities ?? 0} pending`}
              trendColor="text-zinc-500 dark:text-zinc-400"
            />
          </div>
        </section>

        <section>
          <SectionHeader title="Delay Analysis" icon={AlertTriangle} />
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Activities Over Schedule"
              value={stats?.delayedActivities ?? 0}
              isLoading={isLoading}
              variant={isDelayCritical ? "red" : "neutral"}
              icon={AlertTriangle}
              cardClassName={
                isDelayCritical
                  ? undefined
                  : "bg-white dark:bg-zinc-950"
              }
              valueClassName="text-red-600 dark:text-red-400"
              trendText={
                (stats?.delayedActivities ?? 0) > 0
                  ? `↑ ${stats?.delayedActivities ?? 0} over schedule`
                  : "✓ None delayed"
              }
              trendColor={
                (stats?.delayedActivities ?? 0) > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }
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
          <SectionHeader title="Constraints" icon={ShieldAlert} />
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

          {!isLoading && (stats?.totalConstraints ?? 0) > 0 && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  Constraint Resolution Progress
                </p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.round(
                    ((stats?.closedConstraints ?? 0) /
                      (stats?.totalConstraints ?? 1)) *
                      100,
                  )}
                  % resolved
                </p>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700 dark:bg-emerald-400"
                  style={{
                    width: `${((stats?.closedConstraints ?? 0) / (stats?.totalConstraints ?? 1)) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>● Open: {stats?.openConstraints ?? 0}</span>
                <span>● Closed: {stats?.closedConstraints ?? 0}</span>
              </div>
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Project Completion" icon={TrendingUp} />
          <div
            className={`rounded-xl border border-zinc-200 bg-gradient-to-br p-6 shadow-sm dark:border-zinc-800 sm:p-8 ${ppcColors.gradient}`}
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Project Completion
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
                    {ppc.toFixed(1)}% of activities completed
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
                    This shows overall project progress — how many activities
                    are marked complete out of the total. This is different
                    from PPC (Percent Plan Complete), which measures weekly
                    planning reliability and is tracked on the Planning page.
                  </p>
                </div>
              </div>
            )}

            {!isLoading && (
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <div className="text-center">
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    {stats?.completedActivities ?? 0}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Completed
                  </p>
                </div>

                <div className="border-x border-zinc-200 text-center dark:border-zinc-800">
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400">
                    {(stats?.totalActivities ?? 0) -
                      (stats?.completedActivities ?? 0)}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Remaining
                  </p>
                </div>

                <div className="text-center">
                  <p
                    className={`text-2xl font-black ${
                      projectedEndVariant === "red"
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {formatDisplayDate(stats?.projectedEndDate ?? null)}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Forecast End
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Project Timeline" icon={Calendar} />
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
              statusBadge={!isLoading ? projectedEndStatusBadge : undefined}
            />
            <TimelineCard
              label="Net Delay Impact"
              value={netDelayDisplay.value}
              subtext={netDelayDisplay.subtext}
              isLoading={isLoading}
              variant={netDelayDisplay.variant}
              schedulePill={netDelaySchedulePill ?? undefined}
              borderClassName={netDelayBorderClass}
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
                    <div className="mb-2 flex items-center justify-between">
                      {hasDurationData && (
                        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                          BASELINE
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {stats?.plannedDurationDays !== null &&
                        stats?.plannedDurationDays !== undefined
                          ? `${stats.plannedDurationDays} days`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
                        style={{
                          width: `${((stats?.plannedDurationDays ?? 0) / durationBarMax) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      {hasDurationData && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                            projectedDurationLonger
                              ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          }`}
                        >
                          {projectedDurationLonger
                            ? `DELAYED +${(stats?.projectedDurationDays ?? 0) - (stats?.plannedDurationDays ?? 0)} days`
                            : `AHEAD ${(stats?.plannedDurationDays ?? 0) - (stats?.projectedDurationDays ?? 0)} days`}
                        </span>
                      )}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {stats?.projectedDurationDays !== null &&
                        stats?.projectedDurationDays !== undefined
                          ? `${stats.projectedDurationDays} days`
                          : "—"}
                      </span>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
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
