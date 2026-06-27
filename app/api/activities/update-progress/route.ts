import { NextResponse } from "next/server";
import { calculateStatus } from "@/lib/activities/calculateStatus";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type UpdateProgressBody = {
  activity_id?: unknown;
  project_id?: unknown;
  progress?: unknown;
};

export async function POST(request: Request) {
  let body: UpdateProgressBody;

  try {
    body = (await request.json()) as UpdateProgressBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { activity_id, project_id, progress } = body;

  if (typeof activity_id !== "string" || !activity_id.trim()) {
    return NextResponse.json({ error: "activity_id is required." }, { status: 400 });
  }

  if (typeof project_id !== "string" || !project_id.trim()) {
    return NextResponse.json({ error: "project_id is required." }, { status: 400 });
  }

  if (typeof progress !== "number") {
    return NextResponse.json({ error: "progress must be a number." }, { status: 400 });
  }

  if (Number.isNaN(progress)) {
    return NextResponse.json({ error: "progress must be a number." }, { status: 400 });
  }

  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress))));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: currentActivity, error: fetchError } = await supabase
    .from("activities")
    .select("progress, status")
    .eq("activity_id", activity_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!currentActivity) {
    return NextResponse.json(
      { error: "Activity not found or not assigned to you" },
      { status: 404 },
    );
  }

  const progressFrom =
    typeof currentActivity.progress === "number"
      ? currentActivity.progress
      : Number(currentActivity.progress ?? 0);
  const statusFrom =
    typeof currentActivity.status === "string" ? currentActivity.status : null;
  const newStatus = calculateStatus(safeProgress);

  const { error: updateError } = await supabase
    .from("activities")
    .update({ progress: safeProgress, status: newStatus })
    .eq("activity_id", activity_id)
    .eq("project_id", project_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: historyError } = await supabaseAdmin.from("activity_history").insert({
    activity_id,
    project_id,
    changed_by: user.id,
    progress_from: Number.isNaN(progressFrom) ? 0 : progressFrom,
    progress_to: safeProgress,
    status_from: statusFrom,
    status_to: newStatus,
    changed_at: new Date().toISOString(),
  });

  if (historyError) {
    console.error("activity_history insert failed:", historyError.message);
  }

  const { data: updatedActivity, error: refetchError } = await supabase
    .from("activities")
    .select(
      "id, project_id, activity_id, activity_name, assigned_to, status, progress, start_date, finish_date, delay_days, act_start_date, act_end_date, is_baseline, created_at",
    )
    .eq("activity_id", activity_id)
    .eq("project_id", project_id)
    .maybeSingle();

  if (refetchError) {
    return NextResponse.json({ error: refetchError.message }, { status: 500 });
  }

  if (!updatedActivity) {
    return NextResponse.json(
      { error: "Activity not found after update." },
      { status: 404 },
    );
  }

  return NextResponse.json({ activity: updatedActivity });
}
