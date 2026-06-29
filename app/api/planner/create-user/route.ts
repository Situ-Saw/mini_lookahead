import { NextResponse } from "next/server";
import {
  generateCredentials,
  type AppRole,
} from "@/lib/admin/credentials";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TEAM_ROLES = ["site_engineer", "viewer"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

type CreateTeamMemberRequest = {
  name?: string;
  role?: string;
  project_id?: string;
  engineer_id?: string;
};

function isTeamRole(value: string): value is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(value);
}

async function requirePlannerOrAdmin(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const { data: membership, error: memberError } = await supabase
    .from("project_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .maybeSingle();

  if (
    memberError ||
    !membership ||
    !["admin", "planner"].includes(membership.role)
  ) {
    return {
      error: NextResponse.json(
        { error: "Only Planners and Admins can create team members" },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function POST(request: Request) {
  let body: CreateTeamMemberRequest;

  try {
    body = (await request.json()) as CreateTeamMemberRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const role = body.role?.trim();
  const projectId = body.project_id?.trim();
  const engineerId = body.engineer_id?.trim();

  if (!name) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }

  if (!role || !isTeamRole(role)) {
    return NextResponse.json(
      { error: "Role must be site_engineer or viewer." },
      { status: 400 },
    );
  }

  if (!projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }

  if (role === "viewer" && !engineerId) {
    return NextResponse.json(
      { error: "Site Engineer assignment is required for viewers." },
      { status: 400 },
    );
  }

  const authCheck = await requirePlannerOrAdmin(projectId);
  if (authCheck.error) {
    return authCheck.error;
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
      { error: "User ID sequence not initialized for this role" },
      { status: 400 },
    );
  }

  const nextSequence = (sequenceRow.last_sequence ?? 0) + 1;
  const { userId, password, email } = generateCredentials(
    project.code,
    role as AppRole,
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

  let viewerAssignmentFailed = false;

  if (role === "viewer" && engineerId) {
    const { error: assignError } = await supabaseAdmin
      .from("viewer_assignments")
      .insert({
        viewer_id: newUserId,
        engineer_id: engineerId,
        project_id: projectId,
        is_active: true,
      });

    if (assignError) {
      console.warn(
        "Viewer assignment failed after user creation:",
        assignError.message,
      );
      viewerAssignmentFailed = true;
    }
  }

  const { error: sequenceUpdateError } = await supabaseAdmin
    .from("user_id_sequences")
    .update({ last_sequence: nextSequence })
    .eq("project_id", projectId)
    .eq("role", role);

  if (sequenceUpdateError) {
    console.error(
      "Failed to update user ID sequence:",
      sequenceUpdateError.message,
    );
  }

  return NextResponse.json({
    user_id: userId,
    new_user_id: newUserId,
    password,
    email,
    warning: viewerAssignmentFailed
      ? "User created but viewer assignment failed"
      : undefined,
  });
}
