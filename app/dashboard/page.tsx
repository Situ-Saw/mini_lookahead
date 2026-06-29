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
    gradient: string;
    label: string;
    value: string;
    iconBg: string;
    iconColor: string;
    leftAccent: string;
  }
> = {
  neutral: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900/60 dark:to-zinc-950",
    label: "text-zinc-500 dark:text-zinc-400",
    value: "text-zinc-900 dark:text-zinc-100",
    iconBg: "bg-zinc-100 dark:bg-zinc-800",
    iconColor: "text-zinc-600 dark:text-zinc-400",
    leftAccent: "border-l-zinc-400 dark:border-l-zinc-500",
  },
  green: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-zinc-950",
    label: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-900 dark:text-emerald-100",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    leftAccent: "border-l-emerald-500 dark:border-l-emerald-400",
  },
  blue: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-zinc-950",
    label: "text-blue-700 dark:text-blue-300",
    value: "text-blue-900 dark:text-blue-100",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    leftAccent: "border-l-blue-500 dark:border-l-blue-400",
  },
  gray: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900/60 dark:to-zinc-950",
    label: "text-zinc-600 dark:text-zinc-400",
    value: "text-zinc-800 dark:text-zinc-200",
    iconBg: "bg-zinc-100 dark:bg-zinc-800",
    iconColor: "text-zinc-500 dark:text-zinc-400",
    leftAccent: "border-l-zinc-400 dark:border-l-zinc-500",
  },
  amber: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-950",
    label: "text-amber-700 dark:text-amber-300",
    value: "text-amber-900 dark:text-amber-100",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
    leftAccent: "border-l-amber-500 dark:border-l-amber-400",
  },
  red: {
    card: "bg-white dark:bg-zinc-950",
    gradient:
      "bg-gradient-to-br from-red-50 to-white dark:from-red-950/30 dark:to-zinc-950",
    label: "text-red-700 dark:text-red-300",
    value: "text-red-900 dark:text-red-100",
    iconBg: "bg-red-100 dark:bg-red-900/40",
    iconColor: "text-red-600 dark:text-red-400",
    leftAccent: "border-l-red-500 dark:border-l-red-400",
  },
};

function getHealthStatus(
  ppc: number,
  hasData: boolean,
): { label: string; color: string } {
  if (!hasData) {
    return {
      label: "No Data",
      color:
        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    };
  }
  if (ppc >= 71) {
    return {
      label: "On Track",
      color:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
    };
  }
  if (ppc >= 41) {
    return {
      label: "At Risk",
      color:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    };
  }
  return {
    label: "Delayed",
    color: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
  };
}

const STATUS_BADGE_STYLES = {
  red: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
} as const;

function ChipSkeleton() {
  return (
    <div className="h-7 w-32 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
  );
}

function KpiSkeleton() {
  return (
    <div className="mt-4 h-14 w-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
  );
}

function CardSkeleton() {
  return (
    <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
  );
}

function KpiCard({
  label,
  value,
  displayValue,
  isLoading,
  variant = "neutral",
  icon: Icon,
  showLeftAccent = false,
  valueClassName,
  trendText,
  trendColor,
  criticalBackground = false,
}: {
  label: string;
  value?: number;
  displayValue?: string;
  isLoading: boolean;
  variant?: KpiVariant;
  icon: LucideIcon;
  showLeftAccent?: boolean;
  valueClassName?: string;
  trendText?: string;
  trendColor?: string;
  criticalBackground?: boolean;
}) {
  const styles = VARIANT_STYLES[variant];
  const rendered = displayValue ?? value?.toLocaleString() ?? "—";
  const cardGradient = criticalBackground
    ? "bg-gradient-to-br from-red-50 to-white dark:from-red-950/40 dark:to-zinc-950"
    : styles.gradient;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-zinc-100 p-6 shadow-md transition-shadow hover:shadow-lg dark:border-zinc-800 ${cardGradient} ${
        showLeftAccent ? `border-l-4 ${styles.leftAccent}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${styles.label}`}>{label}</p>
          {isLoading ? (
            <KpiSkeleton />
          ) : (
            <>
              <p
                className={`mt-3 text-5xl font-black tracking-tight ${valueClassName ?? styles.value}`}
              >
                {rendered}
              </p>
              {trendText && (
                <p className={`mt-1 text-xs font-medium ${trendColor ?? ""}`}>
                  {trendText}
                </p>
              )}
            </>
          )}
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${styles.iconBg}`}>
          <Icon className={`h-5 w-5 ${styles.iconColor}`} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

type TimelineHighlight = "delayed" | "early" | "on-track" | "neutral";

type StatusBadge = {
  label: string;
  className: string;
};

function TimelineCard({
  label,
  value,
  isLoading,
  variant = "neutral",
  subtext,
  icon: Icon,
  highlight = "neutral",
  statusBadge,
  schedulePill,
}: {
  label: string;
  value: string;
  isLoading: boolean;
  variant?: KpiVariant;
  subtext?: string;
  icon?: LucideIcon;
  highlight?: TimelineHighlight;
  statusBadge?: StatusBadge;
  schedulePill?: StatusBadge;
}) {
  const styles = VARIANT_STYLES[variant];

  const highlightClasses: Record<TimelineHighlight, string> = {
    delayed:
      "border-2 border-red-500 bg-white dark:border-red-500 dark:bg-zinc-950",
    early:
      "border-2 border-emerald-500 bg-white dark:border-emerald-500 dark:bg-zinc-950",
    "on-track":
      "border-2 border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40",
    neutral: `border-zinc-100 dark:border-zinc-800 ${styles.gradient}`,
  };

  return (
    <div
      className={`overflow-hidden rounded-2xl border p-6 shadow-md transition-shadow hover:shadow-lg ${highlightClasses[highlight]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-medium ${styles.label}`}>{label}</p>
        {Icon && (
          <div className={`shrink-0 rounded-xl p-2 ${styles.iconBg}`}>
            <Icon className={`h-4 w-4 ${styles.iconColor}`} aria-hidden="true" />
          </div>
        )}
      </div>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <>
          <p
            className={`mt-3 text-2xl font-bold tracking-tight sm:text-3xl ${styles.value}`}
          >
            {value}
          </p>
          {statusBadge && (
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          )}
          {schedulePill && (
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${schedulePill.className}`}
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
            <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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

function getPpcPillClasses(ppc: number): string {
  if (ppc >= 100) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (ppc >= 71) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300";
  }
  if (ppc >= 41) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  }
  return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
}

function CircularProgress({
  value,
  strokeClass,
}: {
  value: number;
  strokeClass: string;
}) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      className="h-44 w-44 shrink-0 -rotate-90"
      viewBox="0 0 140 140"
      aria-hidden="true"
    >
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        strokeWidth="10"
        className="stroke-zinc-200 dark:stroke-zinc-800"
      />
      <circle
        cx="70"
        cy="70"
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

  const netDelayHighlight: TimelineHighlight = useMemo(() => {
    const net = stats?.netDelayDays ?? null;
    if (net === null) return "neutral";
    if (net > 0) return "delayed";
    if (net < 0) return "early";
    return "on-track";
  }, [stats?.netDelayDays]);

  const durationDifference = useMemo(() => {
    const planned = stats?.plannedDurationDays;
    const projected = stats?.projectedDurationDays;
    if (
      planned === null ||
      planned === undefined ||
      projected === null ||
      projected === undefined
    ) {
      return null;
    }
    return projected - planned;
  }, [stats?.plannedDurationDays, stats?.projectedDurationDays]);

  const showBaselineBanner =
    !isLoading && stats !== null && stats.baselineCount === 0;

  if (isProjectLoading) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading project"
        />
      </main>
    );
  }

  if (!activeProject) {
    return (
      <main className="min-h-full bg-zinc-50 dark:bg-zinc-950">
        <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 sm:px-10">
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
    <main className="min-h-full bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-6 py-8 sm:px-10">
        {showBaselineBanner && (
          <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-8 py-10 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="flex flex-col items-center text-center">
              <div className="rounded-full bg-amber-100 p-4 dark:bg-amber-900/40">
                <AlertTriangle
                  className="h-8 w-8 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-amber-900 dark:text-amber-100">
                No baseline imported yet
              </h3>
              <p className="mt-2 max-w-sm text-sm text-amber-700 dark:text-amber-300">
                Import your Primavera P6 baseline schedule to unlock PPC tracking,
                delay analysis, and project timeline.
              </p>
              <Link
                href="/import"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-amber-700"
              >
                Import Baseline →
              </Link>
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-900 px-8 py-8 shadow-xl dark:bg-zinc-800">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Construction Planning
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Project Dashboard
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300">
                  {activeProject.code}
                </span>
                <span className="text-sm text-zinc-400">{activeProject.name}</span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                aria-label="Refresh dashboard data"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Refresh
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
          <SectionHeader title="Activity Status" />
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
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
          )}
        </section>

        <section>
          <SectionHeader title="Delay Analysis" />
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Delayed Activities"
                value={stats?.delayedActivities ?? 0}
                isLoading={isLoading}
                variant="red"
                icon={AlertTriangle}
                showLeftAccent
              />
              <KpiCard
                label="Average Delay"
                displayValue={averageDelayDisplay}
                isLoading={isLoading}
                variant="amber"
                icon={Timer}
                valueClassName="text-amber-600 dark:text-amber-400"
              />
              <KpiCard
                label="Running Early"
                value={stats?.earlyActivities ?? 0}
                isLoading={isLoading}
                variant="green"
                icon={TrendingUp}
                valueClassName="text-emerald-600 dark:text-emerald-400"
              />
            </div>
          )}
        </section>

        <section>
          <SectionHeader title="Constraints" />
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <>
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

              {(stats?.totalConstraints ?? 0) > 0 && (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="mb-2 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>Open</span>
                    <span>Closed</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500 dark:bg-emerald-400"
                      style={{
                        width: `${((stats?.closedConstraints ?? 0) / (stats?.totalConstraints ?? 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-right text-xs text-zinc-500 dark:text-zinc-400">
                    {stats?.closedConstraints ?? 0} of {stats?.totalConstraints ?? 0}{" "}
                    resolved
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        <section>
          <SectionHeader title="Project Completion" />
          <div
            className={`rounded-2xl border border-zinc-100 bg-gradient-to-br p-6 shadow-md dark:border-zinc-800 sm:p-8 ${ppcColors.gradient}`}
          >
            {isLoading ? (
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                <div className="h-44 w-44 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="flex-1 space-y-4">
                  <div className="h-20 w-56 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-4 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-32 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
                <div className="relative flex shrink-0 items-center justify-center">
                  <CircularProgress value={ppc} strokeClass={ppcColors.stroke} />
                  <span
                    className={`absolute text-3xl font-black ${ppcColors.text}`}
                  >
                    {ppc.toFixed(1)}%
                  </span>
                </div>

                <div className="flex-1">
                  <span
                    className={`inline-flex rounded-full px-4 py-1.5 text-sm font-semibold ${getPpcPillClasses(ppc)}`}
                  >
                    {ppcInterpretation}
                  </span>

                  <p className="mt-6 text-4xl font-black text-zinc-900 dark:text-zinc-100">
                    {stats?.completedActivities ?? 0}
                    <span className="text-xl font-medium text-zinc-400 dark:text-zinc-500">
                      /{stats?.totalActivities ?? 0}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    activities completed
                  </p>

                  <p
                    className={`mt-4 text-3xl font-black tracking-tight sm:text-4xl ${ppcColors.text}`}
                  >
                    {ppc.toFixed(1)}% of activities completed
                  </p>

                  <div className="mt-6 h-4 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${ppcColors.bar}`}
                      style={{ width: `${Math.min(ppc, 100)}%` }}
                    />
                  </div>

                  <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
                    This shows overall project progress — how many activities
                    are marked complete out of the total. This is different
                    from PPC (Percent Plan Complete), which measures weekly
                    planning reliability and is tracked on the Planning page.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Project Timeline" />
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <TimelineCard
                label="Planned Start"
                value={formatDisplayDate(stats?.plannedStartDate ?? null)}
                isLoading={isLoading}
                variant="neutral"
                icon={Calendar}
              />
              <TimelineCard
                label="Planned End"
                value={formatDisplayDate(stats?.plannedEndDate ?? null)}
                isLoading={isLoading}
                variant="neutral"
                icon={Calendar}
              />
              <TimelineCard
                label="Projected End Date"
                value={formatDisplayDate(stats?.projectedEndDate ?? null)}
                isLoading={isLoading}
                variant={projectedEndVariant}
                icon={Calendar}
              />
              <TimelineCard
                label="Net Delay Impact"
                value={netDelayDisplay.value}
                subtext={netDelayDisplay.subtext}
                isLoading={isLoading}
                variant={netDelayDisplay.variant}
                icon={Timer}
                highlight={netDelayHighlight}
              />
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-6 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
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

                {durationDifference !== null && durationDifference !== 0 && (
                  <p
                    className={`mb-4 text-sm font-semibold ${
                      durationDifference > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {durationDifference > 0
                      ? `+${durationDifference} days over planned`
                      : `${Math.abs(durationDifference)} days ahead`}
                  </p>
                )}

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Planned</span>
                      <span>
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
                    <div className="mb-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>Projected</span>
                      <span>
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
