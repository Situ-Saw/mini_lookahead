"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { ImportActivitiesResponse } from "@/lib/primavera-import";
import {
  type PrimaveraExcelRow,
  parsePrimaveraExcelRows,
} from "@/lib/primavera-import";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"];

const PREVIEW_COLUMNS: Array<keyof PrimaveraExcelRow> = [
  "task_code",
  "task_name",
  "status_code",
  "wbs_id",
  "target_start_date",
  "target_end_date",
  "target_drtn_hr_cnt",
];

const PREVIEW_COLUMN_LABELS: Record<string, string> = {
  task_code: "Activity ID",
  task_name: "Activity Name",
  status_code: "Status",
  wbs_id: "WBS Code",
  target_start_date: "Planned Start",
  target_end_date: "Planned Finish",
  target_drtn_hr_cnt: "Duration (d)",
};

function isExcelFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) {
    return value.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return String(value);
}

async function parseExcelFile(file: File): Promise<PrimaveraExcelRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    dateNF: "yyyy-mm-dd",
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The Excel file does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  return parsePrimaveraExcelRows(worksheet);
}

export default function ImportActivitiesPage() {
  const inputId = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<PrimaveraExcelRow[] | null>(
    null,
  );
  const [dbImportResult, setDbImportResult] =
    useState<ImportActivitiesResponse | null>(null);

  useEffect(() => {
    document.title = "Import Activities";
  }, []);

  const previewRows = useMemo(
    () => (parsedRows ? parsedRows.slice(0, 5) : []),
    [parsedRows],
  );

  const clearImportMessages = useCallback(() => {
    setError(null);
    setDbImportResult(null);
  }, []);

  const selectFile = useCallback(
    (file: File | null) => {
      clearImportMessages();
      setParsedRows(null);

      if (!file) {
        setSelectedFile(null);
        return;
      }

      if (!isExcelFile(file)) {
        setSelectedFile(null);
        setError("Please upload an Excel file (.xlsx or .xls).");
        return;
      }

      setSelectedFile(file);
    },
    [clearImportMessages],
  );

  const handleImport = useCallback(async () => {
    if (!selectedFile) {
      setError("Select an Excel file before importing.");
      return;
    }

    setIsImporting(true);
    clearImportMessages();
    setParsedRows(null);

    try {
      const rows = await parseExcelFile(selectedFile);
      console.log("Parsed Primavera activity rows:", rows);
      console.log("Parsed row count:", rows.length);
      setParsedRows(rows);
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to parse the Excel file.";
      setError(message);
    } finally {
      setIsImporting(false);
    }
  }, [clearImportMessages, selectedFile]);

  const handleImportToDatabase = useCallback(async () => {
    if (!parsedRows || parsedRows.length === 0) {
      setError("Parse an Excel file before importing to the database.");
      return;
    }

    setIsSavingToDb(true);
    clearImportMessages();

    try {
      const response = await fetch("/api/import-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
      });

      const payload = (await response.json()) as ImportActivitiesResponse;

      if (!response.ok) {
        setDbImportResult(payload);
        throw new Error(
          payload.error ?? "Failed to import activities to the database.",
        );
      }

      setDbImportResult(payload);
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to import activities to the database.";
      setError(message);
    } finally {
      setIsSavingToDb(false);
    }
  }, [clearImportMessages, parsedRows]);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0] ?? null;
      selectFile(file);
    },
    [selectFile],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      selectFile(file);
      event.target.value = "";
    },
    [selectFile],
  );

  const dbImportSucceeded =
    dbImportResult !== null && dbImportResult.failedCount === 0;
  const dbImportPartial =
    dbImportResult !== null &&
    dbImportResult.totalInserted > 0 &&
    dbImportResult.failedCount > 0;
  const dbImportFailed =
    dbImportResult !== null &&
    dbImportResult.totalInserted === 0 &&
    dbImportResult.failedCount > 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Import Activities
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Upload a Primavera P6 Excel export. The descriptive header row is
          skipped automatically and activity data is read from row 3 onward.
        </p>
      </div>

      <div className="space-y-6">
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/30"
              : "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40"
          }`}
        >
          <input
            id={inputId}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={handleFileInputChange}
            className="sr-only"
          />

          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="rounded-full bg-white p-3 shadow-sm dark:bg-zinc-950">
              <svg
                aria-hidden="true"
                className="h-8 w-8 text-zinc-500 dark:text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Drag and drop your Excel file here
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                or{" "}
                <label
                  htmlFor={inputId}
                  className="cursor-pointer font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  browse files
                </label>
              </p>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Supported formats: .xlsx, .xls
            </p>
          </div>
        </div>

        {selectedFile && (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Selected file</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {selectedFile.name}
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        )}

        {dbImportSucceeded && dbImportResult && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            Successfully imported {dbImportResult.totalInserted} of{" "}
            {dbImportResult.totalValidRows} valid rows ({dbImportResult.totalReceived}{" "}
            received).
          </p>
        )}

        {dbImportPartial && dbImportResult && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Partially imported {dbImportResult.totalInserted} of{" "}
            {dbImportResult.totalValidRows} valid rows.{" "}
            {dbImportResult.failedCount} row
            {dbImportResult.failedCount === 1 ? "" : "s"} failed.
          </p>
        )}

        {dbImportFailed && dbImportResult && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            Import failed. {dbImportResult.failedCount} of{" "}
            {dbImportResult.totalValidRows} valid rows could not be inserted.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedFile || isImporting || isSavingToDb}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isImporting ? "Parsing..." : "Parse Excel"}
          </button>

          <button
            type="button"
            onClick={handleImportToDatabase}
            disabled={!parsedRows?.length || isImporting || isSavingToDb}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            {isSavingToDb ? "Saving to Database..." : "Import to Database"}
          </button>
        </div>

        {parsedRows && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              Parsed {parsedRows.length} valid activity{" "}
              {parsedRows.length === 1 ? "row" : "rows"} from the first sheet.
            </div>

            {previewRows.length > 0 ? (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  Preview (first 5 rows)
                </h2>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
                  <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/60">
                      <tr>
                        {PREVIEW_COLUMNS.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100"
                          >
                            {PREVIEW_COLUMN_LABELS[column] ?? column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                      {previewRows.map((row, rowIndex) => (
                        <tr
                          key={`${normalizePreviewKey(row)}-${rowIndex}`}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                        >
                          {PREVIEW_COLUMNS.map((column) => (
                            <td
                              key={`${rowIndex}-${column}`}
                              className="max-w-xs truncate px-4 py-3 text-zinc-700 dark:text-zinc-300"
                              title={formatCellValue(row[column])}
                            >
                              {formatCellValue(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                No valid activity rows were found in the first sheet.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function normalizePreviewKey(row: PrimaveraExcelRow): string {
  return String(row.task_code ?? "");
}
