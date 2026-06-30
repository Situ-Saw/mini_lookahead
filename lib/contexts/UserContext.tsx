"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

type CurrentUserContextValue = {
  user: User | null;
  globalRole: string | null;
  projectRole: string | null;
  projectId: string | null;
  isLoading: boolean;
  isProjectRoleLoading: boolean;
};

const UserContext = createContext<CurrentUserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { activeProject } = useActiveProject();
  const projectId = activeProject?.id ?? null;

  const [user, setUser] = useState<User | null>(null);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const [projectRole, setProjectRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectRoleLoading, setIsProjectRoleLoading] = useState(false);
  const [hasBootstrappedUser, setHasBootstrappedUser] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    async function bootstrapUser() {
      setIsLoading(true);

      const supabase = createClient();
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (authError || !authUser) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("global_role")
        .eq("id", authUser.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (profileError) {
        console.error("Failed to load global role:", profileError.message);
      }

      setUser(authUser);
      setGlobalRole(
        typeof profile?.global_role === "string" ? profile.global_role : null,
      );
      setHasBootstrappedUser(true);
    }

    void bootstrapUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!hasBootstrappedUser || !user) {
      return;
    }

    let cancelled = false;

    async function loadProjectRole() {
      if (!projectId || !user) {
        setProjectRole("viewer");
        setIsProjectRoleLoading(false);
        setIsLoading(false);
        return;
      }

      const authUser = user;
      setIsProjectRoleLoading(true);

      const supabase = createClient();
      const { data: memberRow, error: memberError } = await supabase
        .from("project_members")
        .select("role")
        .eq("user_id", authUser.id)
        .eq("project_id", projectId)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (memberError) {
        console.error("Failed to load project role:", memberError.message);
        setProjectRole("viewer");
      } else if (!memberRow) {
        console.warn(
          "No project_members row found for user; defaulting role to viewer.",
        );
        setProjectRole("viewer");
      } else {
        setProjectRole(memberRow.role);
      }

      setIsProjectRoleLoading(false);
      setIsLoading(false);
    }

    void loadProjectRole();

    return () => {
      cancelled = true;
    };
  }, [hasBootstrappedUser, user, projectId]);

  const value = useMemo(
    () => ({
      user,
      globalRole,
      projectRole,
      projectId,
      isLoading,
      isProjectRoleLoading,
    }),
    [
      user,
      globalRole,
      projectRole,
      projectId,
      isLoading,
      isProjectRoleLoading,
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser(): CurrentUserContextValue {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }

  return context;
}
