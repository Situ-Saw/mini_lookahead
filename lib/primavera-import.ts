import * as XLSX from "xlsx";

export type ImportMode = "baseline" | "update";

export type PrimaveraExcelRow = {
  task_code?: unknown;
  task_name?: unknown;
  status_code?: unknown;
  wbs_id?: unknown;
  target_start_date?: unknown;
  target_end_date?: unknown;
  act_start_date?: unknown;
  act_end_date?: unknown;
  target_drtn_hr_cnt?: unknown;
  act_drtn_hr_cnt?: unknown;
  delete_record_flag?: unknown;
  [key: string]: unknown;
};

export type ActivityInsert = {
  activity_id: string;
  activity_name: string | null;
  wbs_code: string | null;
  status: string | null;
  start_date: string | null;
  finish_date: string | null;
  duration: number | null;
  act_start_date: string | null;
  act_end_date: string | null;
  act_duration: number;
  progress: number;
  delay_days: number | null;
  is_baseline?: boolean;
};

export type ImportActivitiesResponse = {
  totalReceived: number;
  totalValidRows: number;
  totalInserted: number;
  failedCount: number;
  error?: string;
  warnings?: ValidationWarning[];
};

export type ValidationWarning = {
  activity_id: string;
  warning: string;
};

const DESCRIPTIVE_HEADER_MARKERS = {
  taskCode: "Activity ID",
  taskName: "Activity Name",
  duration: "Original Duration(d)",
  actDuration: "(*)Actual Duration(d)",
  deleteFlag: "Delete This Row",
} as const;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const DELETE_FLAG_VALUES = new Set([
  "y",
  "yes",
  "true",
  "1",
  "x",
  "delete",
]);

function normalizeCell(value: unknown): string {
  return String(value ?? "").trim();
}

export function formatToDateString(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * MS_PER_DAY));
    if (Number.isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const trimmed = value.trim();

    const primaveraMatch = trimmed.match(
      /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
    );
    if (primaveraMatch) {
      const day = Number(primaveraMatch[1]);
      const month = Number(primaveraMatch[2]);
      const year = Number(primaveraMatch[3]);

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

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) return null;

    if (trimmed.includes("T")) {
      return trimmed.split("T")[0];
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return null;
}

export function isFinishBeforeStart(
  startDate: string | null,
  finishDate: string | null,
): boolean {
  if (!startDate || !finishDate) return false;

  const start = new Date(startDate);
  const finish = new Date(finishDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
    return false;
  }

  return finish < start;
}

/** @deprecated Use formatToDateString instead */
export function parsePrimaveraDate(value: unknown): string | null {
  return formatToDateString(value);
}

export function calculateDelayDays(
  actDate: string | null,
  plannedDate: string | null,
): number | null {
  if (!actDate || !plannedDate) return null;

  const act = new Date(actDate);
  const planned = new Date(plannedDate);
  if (Number.isNaN(act.getTime()) || Number.isNaN(planned.getTime())) {
    return null;
  }

  return Math.round((act.getTime() - planned.getTime()) / MS_PER_DAY);
}

function resolveActivityDelayDays(
  actEndDate: string | null,
  finishDate: string | null,
  actStartDate: string | null,
  startDate: string | null,
): number | null {
  if (actEndDate && finishDate) {
    return calculateDelayDays(actEndDate, finishDate);
  }

  if (actStartDate && startDate) {
    return calculateDelayDays(actStartDate, startDate);
  }

  return null;
}

function isDeleteFlagSet(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const text = normalizeCell(value).toLowerCase();
  if (!text) return false;
  if (text === DESCRIPTIVE_HEADER_MARKERS.deleteFlag.toLowerCase()) return false;

  return DELETE_FLAG_VALUES.has(text);
}

function isCompletedStatus(status: string | null): boolean {
  if (!status) return false;

  const normalized = status.toLowerCase().trim();
  return normalized === "completed" || normalized.includes("complete");
}

function isNotStartedStatus(status: string | null): boolean {
  if (!status) return false;

  const normalized = status.toLowerCase().trim();
  return (
    normalized === "not started" ||
    (normalized.includes("not") && normalized.includes("start"))
  );
}

export function calculateProgress(
  status: string | null,
  actDuration: number,
  duration: number | null,
): number {
  if (isCompletedStatus(status)) return 100;
  if (isNotStartedStatus(status)) return 0;

  if (actDuration > 0 && duration !== null && duration > 0) {
    return Math.min(100, Math.round((actDuration / duration) * 100));
  }

  return 0;
}

export function isValidActivityRow(row: PrimaveraExcelRow): boolean {
  if (isDeleteFlagSet(row.delete_record_flag)) return false;

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
  if (
    normalizeCell(row.act_drtn_hr_cnt) === DESCRIPTIVE_HEADER_MARKERS.actDuration
  ) {
    return false;
  }

  return true;
}

function toNullableString(value: unknown): string | null {
  const text = normalizeCell(value);
  return text === "" ? null : text;
}

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && !Number.isNaN(value)) return value;

  const text = normalizeCell(value);
  if (
    !text ||
    text === DESCRIPTIVE_HEADER_MARKERS.duration ||
    text === DESCRIPTIVE_HEADER_MARKERS.actDuration
  ) {
    return null;
  }

  const numeric = Number(text);
  return Number.isNaN(numeric) ? null : numeric;
}

export function parseDuration(value: unknown): number | null {
  const numeric = parseNumericValue(value);
  return numeric === null ? null : Math.round(numeric);
}

export function parseActDuration(value: unknown): number {
  return parseNumericValue(value) ?? 0;
}

export function mapExcelRowToActivity(
  row: PrimaveraExcelRow,
  mode: ImportMode,
): ActivityInsert {
  const status = toNullableString(row.status_code);
  const startDate = formatToDateString(row.target_start_date);
  const finishDate = formatToDateString(row.target_end_date);
  const actStartDate = formatToDateString(row.act_start_date);
  const actEndDate = formatToDateString(row.act_end_date);
  const duration = parseDuration(row.target_drtn_hr_cnt);
  const actDuration = parseActDuration(row.act_drtn_hr_cnt);

  const activity: ActivityInsert = {
    activity_id: normalizeCell(row.task_code),
    activity_name: toNullableString(row.task_name),
    wbs_code: toNullableString(row.wbs_id),
    status,
    start_date: startDate,
    finish_date: finishDate,
    duration,
    act_start_date: actStartDate,
    act_end_date: actEndDate,
    act_duration: actDuration,
    progress: calculateProgress(status, actDuration, duration),
    delay_days: resolveActivityDelayDays(
      actEndDate,
      finishDate,
      actStartDate,
      startDate,
    ),
  };

  if (mode === "baseline") {
    activity.is_baseline = true;
  }

  return activity;
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

export function parsePrimaveraExcelRows(
  worksheet: XLSX.WorkSheet,
): PrimaveraExcelRow[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: true,
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

export function parsePrimaveraWorksheet(
  worksheet: XLSX.WorkSheet,
  mode: ImportMode,
): ActivityInsert[] {
  return parsePrimaveraExcelRows(worksheet).map((row) =>
    mapExcelRowToActivity(row, mode),
  );
}

export function mapRowsToActivities(
  rows: PrimaveraExcelRow[],
  mode: ImportMode,
): ActivityInsert[] {
  return rows
    .filter(isValidActivityRow)
    .map((row) => mapExcelRowToActivity(row, mode));
}

export function validateActivities(
  activities: ActivityInsert[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  for (const activity of activities) {
    if (isFinishBeforeStart(activity.start_date, activity.finish_date)) {
      warnings.push({
        activity_id: activity.activity_id,
        warning: `Finish date (${activity.finish_date}) is before start date (${activity.start_date})`,
      });
    }

    if (activity.progress < 0 || activity.progress > 100) {
      warnings.push({
        activity_id: activity.activity_id,
        warning: `Progress ${activity.progress}% is outside valid range (0-100)`,
      });
    }
  }

  return warnings;
}

export function toUpsertPayload(
  activities: ActivityInsert[],
  mode: ImportMode,
): Omit<ActivityInsert, "is_baseline">[] | ActivityInsert[] {
  if (mode === "baseline") {
    return activities;
  }

  return activities.map(({ is_baseline: _isBaseline, ...activity }) => activity);
}
