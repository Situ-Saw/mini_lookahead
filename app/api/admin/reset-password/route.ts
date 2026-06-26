import { NextResponse } from "next/server";
import {
  generatePasswordFromParts,
  parseCredentialsFromEmail,
} from "@/lib/admin/credentials";
import { requireAdmin } from "@/lib/admin/require-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ResetPasswordRequest = {
  user_id?: string;
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return adminCheck.error;
  }

  let body: ResetPasswordRequest;

  try {
    body = (await request.json()) as ResetPasswordRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userId = body.user_id?.trim();

  if (!userId) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, is_active")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (profile.is_active === false) {
    return NextResponse.json(
      { error: "Cannot reset password for an inactive user." },
      { status: 400 },
    );
  }

  const parsed = parseCredentialsFromEmail(profile.email);
  if (!parsed) {
    return NextResponse.json(
      { error: "Unable to parse user credentials from email format." },
      { status: 400 },
    );
  }

  const newPassword = generatePasswordFromParts(
    parsed.projectCode,
    parsed.roleCode,
    parsed.sequence,
  );

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { password: newPassword },
  );

  if (authError) {
    return NextResponse.json(
      { error: `Failed to reset password: ${authError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ new_password: newPassword });
}
