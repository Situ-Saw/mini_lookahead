import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

type DeactivateUserRequest = {
  user_id?: string;
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return adminCheck.error;
  }

  let body: DeactivateUserRequest;

  try {
    body = (await request.json()) as DeactivateUserRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.user_id?.trim();

  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  if (userId === adminCheck.adminId) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account." },
      { status: 400 },
    );
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (profile.is_active === false) {
    return NextResponse.json({ error: "User is already inactive." }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to deactivate user: ${updateError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
