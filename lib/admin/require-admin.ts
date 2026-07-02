import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminSuccess = {
  adminId: string;
  error?: never;
};

type AdminFailure = {
  adminId?: never;
  error: NextResponse;
};

export async function requireAdmin(): Promise<AdminSuccess | AdminFailure> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.global_role !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { adminId: user.id };
}
