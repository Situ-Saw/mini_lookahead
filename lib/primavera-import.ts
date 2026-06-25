import * as XLSX from "xlsx";

export type PrimaveraExcelRow = {
  task_code?: unknown;
  task_name?: unknown;
  status_code?: unknown;
  wbs_id?: unknown;
  target_start_date?: unknown;
  target_end_date?: unknown;
  target_drtn_hr_cnt?: unknown;
  [key: string]: unknown;
};

export type ActivityInsert = {
  activity_id: string;
  activity_name: string | null;
  status: string | null;
  wbs_code: string | null;
  start_date: string | null;
  finish_date: string | null;
  duration: number | null;
};

export type ImportActivitiesResponse = {
  totalReceived: number;
  totalValidRows: number;
  totalInserted: number;
  failedCount: number;
  error?: string;
};

const DESCRIPTIVE_HEADER_MARKERS = {
  taskCode: "Activity ID",
  taskName: "Activity Name",
  duration: "Original Duration(d)",
} as const;

function normalizeCell(value: unknown): string {
  return String(value ?? "").trim();
}

export function parsePrimaveraDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = normalizeCell(value);
  if (!text) return null;

  const match = text.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isValidActivityRow(row: PrimaveraExcelRow): boolean {
  const taskCode = normalizeCell(row.task_code);
  if (!taskCode) return false;
  if (taskCode === DESCRIPTIVE_HEADER_MARKERS.taskCode) return false;
  if (normalizeCell(row.task_name) === DESCRIPTIVE_HEADER_MARKERS.taskName) {
    return false;
  }
  if (
    normalizeCell(row.target_drtn_hr_cnt) === DESCRIPTIVE_HEADER_MARKERS.duration
  ) {
    return false;
  }

  return true;
}

function toNullableString(value: unknown): string | null {
  const text = normalizeCell(value);
  return text === "" ? null : text;
}

export function parseNumericDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && !Number.isNaN(value)) return value;

  const text = normalizeCell(value);
  if (!text || text === DESCRIPTIVE_HEADER_MARKERS.duration) return null;

  const numeric = Number(text);
  return Number.isNaN(numeric) ? null : numeric;
}

export function mapExcelRowToActivity(row: PrimaveraExcelRow): ActivityInsert {
  return {
    activity_id: normalizeCell(row.task_code),
    activity_name: toNullableString(row.task_name),
    status: toNullableString(row.status_code),
    wbs_code: toNullableString(row.wbs_id),
    start_date: parsePrimaveraDate(row.target_start_date),
    finish_date: parsePrimaveraDate(row.target_end_date),
    duration: parseNumericDuration(row.target_drtn_hr_cnt),
  };
}

function rowArrayToObject(
  headers: string[],
  values: unknown[],
): PrimaveraExcelRow {
  const row: PrimaveraExcelRow = {};

  headers.forEach((header, index) => {
    if (!header) return;
    row[header] = values[index];
  });

  return row;
}

export function parsePrimaveraWorksheet(
  worksheet: XLSX.WorkSheet,
): PrimaveraExcelRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  if (matrix.length < 3) return [];

  const headerRow = matrix[0];
  if (!Array.isArray(headerRow)) return [];

  const headers = headerRow.map((cell) => normalizeCell(cell));
  const dataRows = matrix.slice(2);

  return dataRows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => rowArrayToObject(headers, row))
    .filter(isValidActivityRow);
}

export function mapRowsToActivities(rows: PrimaveraExcelRow[]): ActivityInsert[] {
  return rows.filter(isValidActivityRow).map(mapExcelRowToActivity);
}
