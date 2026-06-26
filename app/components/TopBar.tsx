"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

const SIDEBAR_WIDTH_PX = 56;

function getPageTitle(pathname: string): string {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    return "Project Dashboard";
  }

  if (pathname === "/activities" || pathname.startsWith("/activities/")) {
    return "Activity Master";
  }

  if (pathname === "/lookahead" || pathname.startsWith("/lookahead/")) {
    return "Look Ahead";
  }

  if (pathname === "/planning" || pathname.startsWith("/planning/")) {
    return "Planning Sessions";
  }

  if (pathname === "/constraints" || pathname.startsWith("/constraints/")) {
    return "Constraints";
  }

  if (
    pathname === "/import" ||
    pathname.startsWith("/import/") ||
    pathname.startsWith("/activities/import")
  ) {
    return "Import Schedule";
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "Admin Panel";
  }

  return "Look Ahead Planner";
}

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeProject } = useActiveProject();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      setUserEmail(user?.email ?? null);
    }

    void loadUser();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    const supabase = createClient();
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className="fixed top-0 right-0 z-40 flex h-12 items-center justify-between border-b border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950"
      style={{ left: SIDEBAR_WIDTH_PX }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 sm:text-base">
          {pageTitle}
        </h1>
        {activeProject && (
          <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            [{activeProject.code}]
          </span>
        )}
        {activeProject && (
          <button
            type="button"
            onClick={() => router.push("/select-project")}
            className="hidden shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 sm:inline-flex dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            Switch Project
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <p
          className="hidden max-w-[12rem] truncate text-xs text-zinc-500 dark:text-zinc-400 sm:block md:max-w-[16rem]"
          title={userEmail ?? undefined}
        >
          {userEmail ?? "—"}
        </p>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={isSigningOut}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {isSigningOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </header>
  );
}
