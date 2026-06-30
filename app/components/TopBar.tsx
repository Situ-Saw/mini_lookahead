"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { displayUserId } from "@/lib/admin/credentials";
import { useActiveProject } from "@/lib/hooks/useActiveProject";
import { useCurrentUser } from "@/lib/contexts/UserContext";
import ThemeToggle from "@/app/components/ThemeToggle";

const SIDEBAR_WIDTH_PX = 56;

const ROLE_AVATAR_STYLES: Record<string, string> = {
  admin: "bg-zinc-800",
  planner: "bg-blue-600",
  site_engineer: "bg-amber-600",
  viewer: "bg-zinc-600",
};

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin:
    "bg-zinc-100 text-zinc-700 dark:border dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
  planner:
    "bg-blue-100 text-blue-700 dark:border dark:border-blue-600 dark:bg-blue-600 dark:text-white",
  site_engineer:
    "bg-amber-100 text-amber-800 dark:border dark:border-amber-600 dark:bg-amber-600 dark:text-white",
  viewer:
    "bg-gray-100 text-gray-600 dark:border dark:border-zinc-600 dark:bg-zinc-600 dark:text-white",
};

const TOPBAR_THEME_TOGGLE_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20";

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

function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getUserDisplayName(
  user: ReturnType<typeof useCurrentUser>["user"],
): string {
  const metadataName = user?.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  if (user?.email) {
    return displayUserId(user.email);
  }

  return "User";
}

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeProject } = useActiveProject();
  const { user, projectRole, globalRole } = useCurrentUser();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const userEmail = user?.email ?? null;
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const userInitial = displayName.charAt(0).toUpperCase();
  const role = projectRole ?? globalRole ?? "viewer";
  const avatarStyle = ROLE_AVATAR_STYLES[role] ?? ROLE_AVATAR_STYLES.viewer;
  const roleBadgeStyle = ROLE_BADGE_STYLES[role] ?? ROLE_BADGE_STYLES.viewer;
  const userIdDisplay = userEmail ? displayUserId(userEmail) : "—";

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setIsAccountMenuOpen(false);

    localStorage.removeItem("active_project");
    document.cookie = "active_project=; path=/; max-age=0; SameSite=Lax";

    const supabase = createClient();
    await supabase.auth.signOut();

    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSigningOut) {
        setIsAccountMenuOpen(false);
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isAccountMenuOpen, isSigningOut]);

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

      <div className="flex shrink-0 items-center gap-2">
        <ThemeToggle className={TOPBAR_THEME_TOGGLE_CLASS} />

        <div className="relative" ref={accountMenuRef}>
          <button
            type="button"
            onClick={() => setIsAccountMenuOpen((open) => !open)}
            aria-label="Open account menu"
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 ${avatarStyle}`}
          >
            {userInitial}
          </button>

          {isAccountMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-2xl dark:shadow-black/40"
            >
              <p className="truncate text-sm font-semibold text-zinc-900">
                {displayName}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-500">
                {userIdDisplay}
              </p>
              <p
                className="mt-1 truncate text-xs text-zinc-500"
                title={userEmail ?? undefined}
              >
                {userEmail ?? "—"}
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadgeStyle}`}
              >
                {formatRole(role)}
              </span>

              <div className="my-3 border-t border-zinc-200" />

              <button
                type="button"
                role="menuitem"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="inline-flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
