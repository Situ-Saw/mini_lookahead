"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/app/components/Sidebar";
import TopBar from "@/app/components/TopBar";

const AUTH_PATHS = new Set(["/login"]);

function isAuthRoute(pathname: string): boolean {
  return AUTH_PATHS.has(pathname) || pathname.startsWith("/auth/");
}

export default function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <TopBar />
      <div className="min-h-full pl-14 pt-12">{children}</div>
    </>
  );
}
