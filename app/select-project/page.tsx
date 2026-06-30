"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ACTIVE_PROJECT_KEY = "active_project";

type ProjectRole = "admin" | "planner" | "site_engineer" | "viewer";

type UserProject = {
  id: string;
  name: string;
  code: string;
  role: ProjectRole;
};

function normalizeProjectMemberRow(
  row: Record<string, unknown>,
): UserProject | null {
  const projects = row.projects;
  const project =
    Array.isArray(projects) && projects.length > 0
      ? (projects[0] as Record<string, unknown>)
      : (projects as Record<string, unknown> | null);

  if (!project?.id || !project.name || !project.code) {
    return null;
  }

  const role = String(row.role);
  const projectRole: ProjectRole =
    role === "admin" ||
    role === "planner" ||
    role === "site_engineer" ||
    role === "viewer"
      ? role
      : "viewer";

  return {
    id: String(project.id),
    name: String(project.name),
    code: String(project.code),
    role: projectRole,
  };
}

const ROLE_BADGE_STYLES: Record<ProjectRole, string> = {
  admin:
    "bg-zinc-100 text-zinc-700 dark:border dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
  planner:
    "bg-blue-100 text-blue-700 dark:border dark:border-blue-600 dark:bg-blue-600 dark:text-white",
  site_engineer:
    "bg-amber-100 text-amber-800 dark:border dark:border-amber-600 dark:bg-amber-600 dark:text-white",
  viewer:
    "bg-gray-100 text-gray-600 dark:border dark:border-zinc-600 dark:bg-zinc-600 dark:text-white",
};

function formatRole(role: ProjectRole): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function persistActiveProject(project: UserProject) {
  const value = JSON.stringify({
    id: project.id,
    name: project.name,
    code: project.code,
    role: project.role,
  });

  localStorage.setItem(ACTIVE_PROJECT_KEY, value);

  document.cookie = `${ACTIVE_PROJECT_KEY}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export default function SelectProjectPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const selectProject = useCallback(
    (project: UserProject) => {
      persistActiveProject(project);
      router.push("/dashboard");
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("project_members")
        .select("role, projects!inner(id, name, code)")
        .eq("user_id", user.id);

      if (!isMounted) return;

      if (error) {
        setFetchError("Unable to load your projects. Please try again.");
        setIsLoading(false);
        return;
      }

      const userProjects = (data ?? [])
        .map((row) =>
          normalizeProjectMemberRow(row as Record<string, unknown>),
        )
        .filter((project): project is UserProject => project !== null)
        .sort((a, b) => a.name.localeCompare(b.name));

      if (userProjects.length === 1) {
        selectProject(userProjects[0]);
        return;
      }

      setProjects(userProjects);
      setIsLoading(false);
    }

    void loadProjects();

    return () => {
      isMounted = false;
    };
  }, [router, selectProject]);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    localStorage.removeItem(ACTIVE_PROJECT_KEY);
    document.cookie = `${ACTIVE_PROJECT_KEY}=; path=/; max-age=0; SameSite=Lax`;

    const supabase = createClient();
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-[#e8f6f7] via-[#eaf4ff] to-[#f0f9ed] px-4 py-10 dark:bg-none dark:bg-[#0a1420]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(53,159,171,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(84,181,251,0.25) 0%, transparent 50%)",
        }}
      />
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-300 dark:hover:text-white"
        >
          {isSigningOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <div className="relative z-10 w-full max-w-lg">
          <div className="mb-8 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-[#359FAB] dark:text-[#54B5FB]">
              Look Ahead Planner
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              Select a Project
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Choose a project to continue
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2
                className="h-8 w-8 animate-spin text-zinc-400"
                aria-label="Loading projects"
              />
            </div>
          ) : fetchError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {fetchError}
            </p>
          ) : projects.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-200/30 dark:bg-white/95 dark:text-zinc-500 dark:shadow-xl dark:shadow-black/30">
              No projects assigned to your account.
              <br />
              Please contact your administrator.
            </p>
          ) : (
            <ul className="space-y-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => selectProject(project)}
                    className="group flex w-full items-center gap-4 rounded-xl border border-zinc-200 border-l-4 border-l-[#359FAB]/40 bg-white p-4 text-left shadow-lg shadow-black/5 transition-all hover:border-blue-300 hover:shadow-xl dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30 dark:hover:border-blue-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-900">
                        {project.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-500">
                        {project.code}
                      </p>
                      <span
                        className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE_STYLES[project.role] ?? ROLE_BADGE_STYLES.viewer}`}
                      >
                        {formatRole(project.role)}
                      </span>
                    </div>
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-zinc-400 transition-colors group-hover:text-blue-500"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
