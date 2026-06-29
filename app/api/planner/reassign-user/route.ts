import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TEAM_ROLES = ["site_engineer", "viewer"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

type ReassignUserRequest = {
  user_id_display?: string;
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
  let body: ReassignUserRequest;

  try {
    body = (await request.json()) as ReassignUserRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userIdDisplay = body.user_id_display?.trim();
  const role = body.role?.trim();
  const projectId = body.project_id?.trim();
  const engineerId = body.engineer_id?.trim();

  if (!userIdDisplay) {
    return NextResponse.json({ error: "User ID is required." }, { status: 400 });
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

  const email = `${userIdDisplay.toUpperCase()}@lookahead.app`;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: `Failed to look up user: ${profileError.message}` },
      { status: 500 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "User not found. Check the User ID." },
      { status: 404 },
    );
  }

  const { data: existingMember, error: existingError } = await supabaseAdmin
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: `Failed to check project membership: ${existingError.message}` },
      { status: 500 },
    );
  }

  if (existingMember) {
    return NextResponse.json(
      { error: "User is already a member of this project" },
      { status: 409 },
    );
  }

  const { error: memberError } = await supabaseAdmin
    .from("project_members")
    .insert({
      project_id: projectId,
      user_id: profile.id,
      role,
    });

  if (memberError) {
    return NextResponse.json(
      { error: `Failed to add user to project: ${memberError.message}` },
      { status: 500 },
    );
  }

  let viewerAssignmentFailed = false;

  if (role === "viewer" && engineerId) {
    const { error: assignError } = await supabaseAdmin
      .from("viewer_assignments")
      .insert({
        viewer_id: profile.id,
        engineer_id: engineerId,
        project_id: projectId,
        is_active: true,
      });

    if (assignError) {
      console.warn(
        "Viewer assignment failed after reassign:",
        assignError.message,
      );
      viewerAssignmentFailed = true;
    }
  }

  return NextResponse.json({
    name: profile.name,
    role,
    message: "User added to project",
    warning: viewerAssignmentFailed
      ? "User added but viewer assignment failed"
      : undefined,
  });
}
