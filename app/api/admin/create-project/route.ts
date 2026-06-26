import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CreateProjectRequest = {
  name?: string;
  code?: string;
};

const SEQUENCE_ROLES = [
  "admin",
  "planner",
  "site_engineer",
  "viewer",
] as const;

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (adminCheck.error) {
    return adminCheck.error;
  }

  let body: CreateProjectRequest;

  try {
    body = (await request.json()) as CreateProjectRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const code = body.code?.trim().toUpperCase();

  if (!name) {
    return NextResponse.json(
      { error: "Project name is required." },
      { status: 400 },
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Project code is required." },
      { status: 400 },
    );
  }

  if (code.length > 6) {
    return NextResponse.json(
      { error: "Project code must be 6 characters or fewer." },
      { status: 400 },
    );
  }

  if (/\s/.test(code)) {
    return NextResponse.json(
      { error: "Project code cannot contain spaces." },
      { status: 400 },
    );
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .insert({
      name,
      code,
      created_by: adminCheck.adminId,
    })
    .select("id, name, code, created_at")
    .single();

  if (projectError) {
    const message = projectError.code === "23505"
      ? `Project code "${code}" already exists.`
      : projectError.message;

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { error: sequenceError } = await supabaseAdmin
    .from("user_id_sequences")
    .insert(
      SEQUENCE_ROLES.map((role) => ({
        project_id: project.id,
        role,
        last_sequence: 0,
      })),
    );

  if (sequenceError) {
    await supabaseAdmin.from("projects").delete().eq("id", project.id);
    return NextResponse.json(
      { error: `Failed to initialize ID sequences: ${sequenceError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ project });
}
