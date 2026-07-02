"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UseProjectRoleResult = {
  role: string | null;
  isRoleLoading: boolean;
  projectId: string | null;
};

export function useProjectRole(): UseProjectRoleResult {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    async function loadRole() {
      try {
        const storedProject = localStorage.getItem("active_project");
        let resolvedProjectId: string | null = null;

        if (storedProject) {
          try {
            const parsed = JSON.parse(storedProject) as { id?: string };
            resolvedProjectId = parsed.id?.trim() || null;
          } catch {
            resolvedProjectId = storedProject.trim() || null;
          }
        }

        if (!resolvedProjectId) {
          if (!cancelled) {
            setRole("viewer");
            setProjectId(null);
            setIsRoleLoading(false);
          }
          return;
        }

        const supabaseClient = createClient();
        const {
          data: { user: authUser },
          error: authError,
        } = await supabaseClient.auth.getUser();

        if (authError || !authUser) {
          router.push("/login");
          return;
        }

        const { data: memberRow, error: memberError } = await supabaseClient
          .from("project_members")
          .select("role")
          .eq("user_id", authUser.id)
          .eq("project_id", resolvedProjectId)
          .maybeSingle();

        if (memberError) {
          throw new Error(memberError.message);
        }

        let resolvedRole: string;
        if (!memberRow) {
          console.warn(
            "No project_members row found for user; defaulting role to viewer.",
          );
          resolvedRole = "viewer";
        } else {
          resolvedRole = memberRow.role;
        }

        if (!cancelled) {
          setRole(resolvedRole);
          setProjectId(resolvedProjectId);
          setIsRoleLoading(false);
        }
      } catch {
        if (!cancelled) {
          setRole("viewer");
          setIsRoleLoading(false);
        }
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { role, isRoleLoading, projectId };
}
