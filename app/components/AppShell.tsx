"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import TopBar from "@/app/components/TopBar";
import { UserProvider } from "@/lib/contexts/UserContext";

const SHELL_EXCLUDED_PATHS = new Set(["/login", "/select-project"]);

function isShellExcludedRoute(pathname: string): boolean {
  return (
    SHELL_EXCLUDED_PATHS.has(pathname) || pathname.startsWith("/auth/")
  );
}

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  if (isShellExcludedRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <UserProvider>
      <Sidebar />
      <TopBar />
      <div className="min-h-full pl-14 pt-12">{children}</div>
    </UserProvider>
  );
}
