"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type DashboardStats = {
  totalActivities: number;
  completedActivities: number;
  inProgressActivities: number;
  notStartedActivities: number;
  totalConstraints: number;
  openConstraints: number;
  closedConstraints: number;
};

function normalizeProgress(value: unknown): number {
  if (value === null || value === "") return 0;

  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return 0;

  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function calculatePpc(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 1000) / 10;
}

function getPpcBarColor(ppc: number): string {
  if (ppc >= 100) return "bg-emerald-500 dark:bg-emerald-400";
  if (ppc >= 71) return "bg-blue-500 dark:bg-blue-400";
  if (ppc >= 41) return "bg-amber-400 dark:bg-amber-500";
  return "bg-red-500 dark:bg-red-400";
}

function KpiCard({
  label,
  value,
  isLoading,
  variant = "neutral",
}: {
  label: string;
  value: number;
  isLoading: boolean;
  variant?: "neutral" | "green" | "blue" | "gray" | "amber";
}) {
  const styles = {
    neutral:
      "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
    green:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30",
    blue: "border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30",
    gray: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50",
    amber:
      "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  } as const;

  const labelStyles = {
    neutral: "text-zinc-500 dark:text-zinc-400",
    green: "text-emerald-700 dark:text-emerald-300",
    blue: "text-blue-700 dark:text-blue-300",
    gray: "text-zinc-600 dark:text-zinc-400",
    amber: "text-amber-700 dark:text-amber-300",
  } as const;

  const valueStyles = {
    neutral: "text-zinc-900 dark:text-zinc-100",
    green: "text-emerald-900 dark:text-emerald-100",
    blue: "text-blue-900 dark:text-blue-100",
    gray: "text-zinc-800 dark:text-zinc-200",
    amber: "text-amber-900 dark:text-amber-100",
  } as const;

  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${styles[variant]}`}
    >
      <p className={`text-sm font-medium ${labelStyles[variant]}`}>{label}</p>
      <p
        className={`mt-2 text-3xl font-bold tracking-tight ${valueStyles[variant]}`}
      >
        {isLoading ? "—" : value.toLocaleString()}
      </p>
    </div>
  );
}

const QUICK_LINKS = [
  {
    title: "Activities",
    href: "/activities",
    description: "View and manage all project activities",
  },
  {
    title: "Import Excel",
    href: "/activities/import",
    description: "Import activities from Primavera Excel export",
  },
  {
    title: "Look Ahead",
    href: "/lookahead",
    description: "Filter upcoming 14-day activities",
  },
  {
    title: "Constraints",
    href: "/constraints",
    description: "Track and manage project constraints",
  },
] as const;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Project Dashboard";
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setIsLoading(true);
      setFetchError(null);

      const [activitiesResult, constraintsResult] = await Promise.all([
        supabase.from("activities").select("progress"),
        supabase.from("constraints").select("status"),
      ]);

      if (!isMounted) return;

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

      const activities = activitiesResult.data ?? [];
      const constraints = constraintsResult.data ?? [];

      let completedActivities = 0;
      let inProgressActivities = 0;
      let notStartedActivities = 0;

      for (const activity of activities) {
        const progress = normalizeProgress(activity.progress);

        if (progress === 100) {
          completedActivities += 1;
        } else if (progress > 0) {
          inProgressActivities += 1;
        } else {
          notStartedActivities += 1;
        }
      }

      let openConstraints = 0;
      let closedConstraints = 0;

      for (const constraint of constraints) {
        if (constraint.status === "Open") {
          openConstraints += 1;
        } else if (constraint.status === "Closed") {
          closedConstraints += 1;
        }
      }

      setStats({
        totalActivities: activities.length,
        completedActivities,
        inProgressActivities,
        notStartedActivities,
        totalConstraints: constraints.length,
        openConstraints,
        closedConstraints,
      });

      setIsLoading(false);
    }

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const ppc = useMemo(() => {
    if (!stats) return 0;
    return calculatePpc(stats.completedActivities, stats.totalActivities);
  }, [stats]);

  const ppcBarColor = getPpcBarColor(ppc);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Project Dashboard
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Overall project health and PPC summary
        </p>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          Failed to load dashboard data: {fetchError}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Activities
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Activities"
            value={stats?.totalActivities ?? 0}
            isLoading={isLoading}
            variant="neutral"
          />
          <KpiCard
            label="Completed"
            value={stats?.completedActivities ?? 0}
            isLoading={isLoading}
            variant="green"
          />
          <KpiCard
            label="In Progress"
            value={stats?.inProgressActivities ?? 0}
            isLoading={isLoading}
            variant="blue"
          />
          <KpiCard
            label="Not Started"
            value={stats?.notStartedActivities ?? 0}
            isLoading={isLoading}
            variant="gray"
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Constraints
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total Constraints"
            value={stats?.totalConstraints ?? 0}
            isLoading={isLoading}
            variant="neutral"
          />
          <KpiCard
            label="Open Constraints"
            value={stats?.openConstraints ?? 0}
            isLoading={isLoading}
            variant="amber"
          />
          <KpiCard
            label="Closed Constraints"
            value={stats?.closedConstraints ?? 0}
            isLoading={isLoading}
            variant="green"
          />
        </div>
      </section>

      <section className="mb-8">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-8">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Plan Percent Complete (PPC)
          </h2>

          {isLoading ? (
            <div className="mt-6 space-y-4">
              <div className="h-12 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
            </div>
          ) : (
            <>
              <p className="mt-4 text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {ppc.toFixed(1)}%
              </p>

              <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${ppcBarColor}`}
                  style={{ width: `${Math.min(ppc, 100)}%` }}
                />
              </div>

              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                {stats?.completedActivities ?? 0} of{" "}
                {stats?.totalActivities ?? 0} activities completed across the
                entire project
              </p>

              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                PPC is calculated based on activities with 100% progress
              </p>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Quick Navigation
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
            >
              <h3 className="font-semibold text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-100">
                {link.title}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {link.description}
              </p>
            </Link>
          ))}

          <div
            aria-hidden="true"
            className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 dark:border-zinc-700 dark:bg-zinc-900/30"
          >
            <h3 className="font-semibold text-zinc-400 dark:text-zinc-600">
              Coming Soon
            </h3>
            <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-600">
              Space reserved for future modules
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
