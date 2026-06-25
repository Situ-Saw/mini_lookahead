import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  type ImportActivitiesResponse,
  type ImportMode,
  type PrimaveraExcelRow,
  isValidActivityRow,
  mapRowsToActivities,
  toUpsertPayload,
} from "@/lib/primavera-import";

export type { ImportActivitiesResponse } from "@/lib/primavera-import";

type ImportActivitiesRequest = {
  rows: PrimaveraExcelRow[];
  mode?: ImportMode;
};

function isImportMode(value: unknown): value is ImportMode {
  return value === "baseline" || value === "update";
}

export async function POST(request: Request) {
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
  const totalReceived = body.rows.length;
  const validRows = body.rows.filter(isValidActivityRow);
  const mappedActivities = mapRowsToActivities(validRows, mode);
  const totalValidRows = mappedActivities.length;

  if (mode === "baseline") {
    const { count, error: baselineCountError } = await supabase
      .from("activities")
      .select("*", { count: "exact", head: true })
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

  const upsertPayload = toUpsertPayload(mappedActivities, mode);

  const { error } = await supabase
    .from("activities")
    .upsert(upsertPayload, { onConflict: "activity_id" });

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
  };

  return NextResponse.json(response);
}
