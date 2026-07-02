import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  type ImportActivitiesResponse,
  type ImportMode,
  type PrimaveraExcelRow,
  isValidActivityRow,
  mapRowsToActivities,
  toUpsertPayload,
  validateActivities,
} from "@/lib/primavera-import";

export type { ImportActivitiesResponse } from "@/lib/primavera-import";

type ImportActivitiesRequest = {
  rows: PrimaveraExcelRow[];
  mode?: ImportMode;
  project_id?: string;
};

function isImportMode(value: unknown): value is ImportMode {
  return value === "baseline" || value === "update";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        totalReceived: 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "Unauthorized",
      } satisfies ImportActivitiesResponse,
      { status: 401 },
    );
  }

  let body: ImportActivitiesRequest;

  try {
    body = (await request.json()) as ImportActivitiesRequest;
  } catch {
    return NextResponse.json(
      {
        totalReceived: 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "Invalid request body. Expected JSON with a rows array.",
      } satisfies ImportActivitiesResponse,
      { status: 400 },
    );
  }

  if (!Array.isArray(body.rows)) {
    return NextResponse.json(
      {
        totalReceived: 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "Invalid request body. Expected a rows array.",
      } satisfies ImportActivitiesResponse,
      { status: 400 },
    );
  }

  const mode: ImportMode = isImportMode(body.mode) ? body.mode : "update";
  const projectId = body.project_id?.trim();

  if (!projectId) {
    return NextResponse.json(
      {
        totalReceived: body.rows?.length ?? 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "project_id is required.",
      } satisfies ImportActivitiesResponse,
      { status: 400 },
    );
  }

  // Verify caller is planner or admin in this project
  const { data: membership, error: memberError } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json(
      {
        totalReceived: 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "You are not a member of this project.",
      } satisfies ImportActivitiesResponse,
      { status: 403 },
    );
  }

  if (!["admin", "planner"].includes(membership.role)) {
    return NextResponse.json(
      {
        totalReceived: 0,
        totalValidRows: 0,
        totalInserted: 0,
        failedCount: 0,
        error: "Only Planners and Admins can import activities.",
      } satisfies ImportActivitiesResponse,
      { status: 403 },
    );
  }

  const totalReceived = body.rows.length;
  const validRows = body.rows.filter(isValidActivityRow);
  const mappedActivities = mapRowsToActivities(validRows, mode);
  const totalValidRows = mappedActivities.length;

  const activityIdCounts = new Map<string, number>();
  for (const activity of mappedActivities) {
    activityIdCounts.set(
      activity.activity_id,
      (activityIdCounts.get(activity.activity_id) ?? 0) + 1,
    );
  }
  const duplicateIds = [...activityIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  if (duplicateIds.length > 0) {
    return NextResponse.json(
      {
        totalReceived,
        totalValidRows,
        totalInserted: 0,
        failedCount: totalValidRows,
        error: `Duplicate activity IDs found in import file: ${duplicateIds.join(", ")}. Each activity ID must be unique within a project.`,
      } satisfies ImportActivitiesResponse,
      { status: 400 },
    );
  }

  const warnings = validateActivities(mappedActivities);

  if (mode === "baseline") {
    const { count, error: baselineCountError } = await supabaseAdmin
      .from("activities")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_baseline", true);

    if (baselineCountError) {
      console.error("Baseline count error:", baselineCountError);

      return NextResponse.json(
        {
          totalReceived,
          totalValidRows,
          totalInserted: 0,
          failedCount: totalValidRows,
          error: baselineCountError.message,
        } satisfies ImportActivitiesResponse,
        { status: 500 },
      );
    }

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "Baseline already imported. To update progress, use Progress Update instead.",
        },
        { status: 400 },
      );
    }
  }

  if (totalValidRows === 0) {
    const response: ImportActivitiesResponse = {
      totalReceived,
      totalValidRows: 0,
      totalInserted: 0,
      failedCount: 0,
    };

    return NextResponse.json(response);
  }

  const upsertPayload = toUpsertPayload(mappedActivities, mode).map(
    (activity) => ({
      ...activity,
      project_id: projectId,
    }),
  );

  const { error } = await supabaseAdmin
    .from("activities")
    .upsert(upsertPayload, { onConflict: "project_id,activity_id" });

  if (error) {
    console.error("Insert error:", error);

    const response: ImportActivitiesResponse = {
      totalReceived,
      totalValidRows,
      totalInserted: 0,
      failedCount: totalValidRows,
      error: error.message,
    };

    return NextResponse.json(response, { status: 500 });
  }

  const response: ImportActivitiesResponse = {
    totalReceived,
    totalValidRows,
    totalInserted: totalValidRows,
    failedCount: 0,
    warnings: warnings.length > 0 ? warnings : undefined,
  };

  return NextResponse.json(response);
}
