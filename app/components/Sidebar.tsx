"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  LucideIcon,
  Menu,
  Shield,
  Upload,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProjectRole } from "@/lib/hooks/useProjectRole";
import { hasRoleAccess, ROLE_ACCESS } from "@/lib/role-access";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  accessKey?: keyof typeof ROLE_ACCESS;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    accessKey: "dashboard",
  },
  {
    label: "Activities",
    href: "/activities",
    icon: ClipboardList,
    accessKey: "activities",
  },
  {
    label: "Import Excel",
    href: "/import",
    icon: Upload,
    accessKey: "import",
  },
  {
    label: "Look Ahead",
    href: "/lookahead",
    icon: Calendar,
    accessKey: "lookahead",
  },
  {
    label: "Planning",
    href: "/planning",
    icon: CalendarCheck,
    accessKey: "planning",
  },
  {
    label: "Constraints",
    href: "/constraints",
    icon: AlertTriangle,
    accessKey: "constraints",
  },
  {
    label: "Team",
    href: "/team",
    icon: Users,
    accessKey: "team",
  },
];

const ADMIN_NAV_ITEM: NavItem = {
  label: "Admin",
  href: "/admin",
  icon: Shield,
  accessKey: "admin_panel",
};

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 240;

const SKELETON_NAV_ITEMS = [...NAV_ITEMS, ADMIN_NAV_ITEM];

function isLinkActive(pathname: string, href: string): boolean {
  if (href === "/activities") {
    return pathname === "/activities";
  }

  if (href === "/import") {
    return pathname === "/import" || pathname.startsWith("/activities/import");
  }

  if (href === "/admin") {
    return pathname === "/admin" || pathname.startsWith("/admin/");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSkeleton({
  item,
  showLabels,
}: {
  item: NavItem;
  showLabels: boolean;
}) {
  const Icon = item.icon;

  return (
    <div
      aria-hidden="true"
      className={`flex animate-pulse items-center rounded-lg py-2.5 text-sm ${
        showLabels ? "gap-3 px-3" : "justify-center px-0"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0 text-zinc-600" />
      {showLabels && <span className="h-4 flex-1 rounded bg-zinc-700/80" />}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { role, isRoleLoading } = useProjectRole();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isGlobalAdminLoading, setIsGlobalAdminLoading] = useState(true);

  const showLabels = isExpanded || isMobileOpen;
  const sidebarWidth = showLabels ? EXPANDED_WIDTH : COLLAPSED_WIDTH;
  const isAccessLoading = isRoleLoading || isGlobalAdminLoading;

  const navItems = useMemo(() => {
    const visibleItems = NAV_ITEMS.filter((item) => {
      if (!item.accessKey) {
        return true;
      }

      return hasRoleAccess(role, item.accessKey);
    });

    if (isGlobalAdmin) {
      visibleItems.push(ADMIN_NAV_ITEM);
    }

    return visibleItems;
  }, [role, isGlobalAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isMounted = true;

    async function loadGlobalAdminStatus() {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError || !user) {
        setIsGlobalAdmin(false);
        setIsGlobalAdminLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("global_role")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (profileError) {
        console.error("Failed to load global role:", profileError.message);
        setIsGlobalAdmin(false);
        setIsGlobalAdminLoading(false);
        return;
      }

      setIsGlobalAdmin(profile?.global_role === "admin");
      setIsGlobalAdminLoading(false);
    }

    void loadGlobalAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-white shadow-sm transition-colors hover:bg-zinc-800 md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        style={{ width: sidebarWidth }}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-zinc-700 bg-zinc-900 text-white transition-[width] duration-200 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-700 px-3">
          {showLabels ? (
            <Link
              href="/dashboard"
              className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
              onClick={() => setIsMobileOpen(false)}
            >
              Look Ahead Planner
            </Link>
          ) : (
            <div className="flex w-full justify-center" aria-hidden="true">
              <Menu className="h-5 w-5 text-zinc-300" />
            </div>
          )}

          {isMobileOpen && (
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white md:hidden"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {isAccessLoading
            ? SKELETON_NAV_ITEMS.map((item) => (
                <NavSkeleton
                  key={item.href}
                  item={item}
                  showLabels={showLabels}
                />
              ))
            : navItems.map((item) => {
                const Icon = item.icon;
                const active = isLinkActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={showLabels ? undefined : item.label}
                    onClick={() => setIsMobileOpen(false)}
                    className={`group relative flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
                      showLabels ? "gap-3 px-3" : "justify-center px-0"
                    } ${
                      active
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />

                    <span
                      className={`truncate whitespace-nowrap transition-opacity duration-200 ${
                        showLabels
                          ? "opacity-100"
                          : "pointer-events-none w-0 overflow-hidden opacity-0"
                      }`}
                    >
                      {item.label}
                    </span>

                    {!showLabels && (
                      <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
        </nav>
      </aside>
    </>
  );
}
