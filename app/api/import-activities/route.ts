import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  type ImportActivitiesResponse,
  type PrimaveraExcelRow,
  isValidActivityRow,
  mapExcelRowToActivity,
} from "@/lib/primavera-import";

export type { ImportActivitiesResponse } from "@/lib/primavera-import";

type ImportActivitiesRequest = {
  rows: PrimaveraExcelRow[];
};

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

  const totalReceived = body.rows.length;
  const validRows = body.rows.filter(isValidActivityRow);
  const mappedActivities = validRows.map(mapExcelRowToActivity);
  const totalValidRows = mappedActivities.length;

  console.log("Rows received:", totalReceived);
  console.log("Rows after filtering:", totalValidRows);
  console.log("First mapped row:", mappedActivities[0] ?? null);

  if (totalValidRows === 0) {
    const response: ImportActivitiesResponse = {
      totalReceived,
      totalValidRows: 0,
      totalInserted: 0,
      failedCount: 0,
    };

    return NextResponse.json(response);
  }

  const { error } = await supabase
    .from("activities")
    .upsert(mappedActivities, { onConflict: "activity_id" });

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
