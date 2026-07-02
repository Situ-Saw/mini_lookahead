import { NextResponse } from "next/server";
import {
  generateCredentials,
  isAppRole,
} from "@/lib/admin/credentials";
import { requireAdmin } from "@/lib/admin/require-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CreateUserRequest = {
  name?: string;
  role?: string;
  project_id?: string;
};

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return adminCheck.error;
  }

  let body: CreateUserRequest;

  try {
    body = (await request.json()) as CreateUserRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const role = body.role?.trim();
  const projectId = body.project_id?.trim();

  if (!name) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!role || !isAppRole(role)) {
    return NextResponse.json({ error: "A valid role is required." }, { status: 400 });
  }

  if (!projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .select("id, code")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data: sequenceRow, error: sequenceError } = await supabaseAdmin
    .from("user_id_sequences")
    .select("last_sequence")
    .eq("project_id", projectId)
    .eq("role", role)
    .single();

  if (sequenceError || !sequenceRow) {
    return NextResponse.json(
      { error: "User ID sequence not initialized for this project and role." },
      { status: 400 },
    );
  }

  const nextSequence = (sequenceRow.last_sequence ?? 0) + 1;
  const { userId, password, email } = generateCredentials(
    project.code,
    role,
    nextSequence,
  );

  const { data: authUser, error: createUserError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

  if (createUserError || !authUser.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? "Failed to create user in Auth." },
      { status: 500 },
    );
  }

  const newUserId = authUser.user.id;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      name,
      email,
      global_role: role,
      is_active: true,
    })
    .eq("id", newUserId);

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: `Failed to update profile: ${profileError.message}` },
      { status: 500 },
    );
  }

  const { error: memberError } = await supabaseAdmin
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: newUserId,
      role,
    });

  if (memberError) {
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return NextResponse.json(
      { error: `Failed to assign project membership: ${memberError.message}` },
      { status: 500 },
    );
  }

  const { error: sequenceUpdateError } = await supabaseAdmin
    .from("user_id_sequences")
    .update({ last_sequence: nextSequence })
    .eq("project_id", projectId)
    .eq("role", role);

  if (sequenceUpdateError) {
    return NextResponse.json(
      {
        error: `User created but sequence update failed: ${sequenceUpdateError.message}`,
        user_id: userId,
        password,
        email,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user_id: userId,
    new_user_id: newUserId,
    password,
    email,
  });
}
