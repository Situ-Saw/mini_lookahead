"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Check, ChevronDown, Loader2, RefreshCw, Shield } from "lucide-react";
import * as XLSX from "xlsx";
import type { ImportActivitiesResponse, ImportMode } from "@/lib/primavera-import";
import {
  type PrimaveraExcelRow,
  parsePrimaveraExcelRows,
} from "@/lib/primavera-import";
import { useActiveProject } from "@/lib/hooks/useActiveProject";
import { useProjectRole } from "@/lib/hooks/useProjectRole";
import { hasRoleAccess } from "@/lib/role-access";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls"];

const IMPORT_PAGE_BG_CLASS =
  "relative min-h-full w-full bg-gradient-to-br from-[#e8f6f7] via-[#eaf4ff] to-[#f0f9ed] dark:bg-none dark:bg-[#0a1420]";

const IMPORT_CARD_BASE =
  "rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const IMPORT_FLOATING_CARD_CLASS = `${IMPORT_CARD_BASE} border-l-4 border-l-[#359FAB] shadow-black/5`;

const IMPORT_TABLE_CARD_CLASS =
  "overflow-x-auto rounded-xl border border-zinc-200 border-l-4 border-l-[#54B5FB] bg-white shadow-lg shadow-[#54B5FB]/15 dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const IMPORT_PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]";

const IMPORT_SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-50";

function ImportPageShell({
  children,
  contentClassName = "relative mx-auto w-full max-w-5xl flex-1 p-6 sm:p-10",
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className={IMPORT_PAGE_BG_CLASS}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(53,159,171,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(84,181,251,0.25) 0%, transparent 50%)",
        }}
      />
      <div className={contentClassName}>{children}</div>
    </main>
  );
}

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

function normalizePreviewKey(row: PrimaveraExcelRow): string {
  return String(row.task_code ?? "");
}

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

function isBaselineAlreadyImportedError(message: string): boolean {
  return message.toLowerCase().includes("baseline already imported");
}

type ModeCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onSelect: () => void;
};

function ModeCard({
  title,
  description,
  icon,
  isSelected,
  onSelect,
}: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-xl border-2 p-5 text-left shadow-lg transition-colors dark:shadow-xl dark:shadow-black/30 ${
        isSelected
          ? "border-blue-500 bg-white dark:border-blue-500 dark:bg-white/95"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-200/30 dark:bg-white/95 dark:hover:border-zinc-300 dark:hover:bg-white"
      }`}
    >
      {isSelected && (
        <span className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      )}

      <div
        className={`mb-3 inline-flex rounded-lg p-2 ${
          isSelected
            ? "bg-blue-100 text-blue-700 dark:bg-blue-100 dark:text-blue-700"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-100 dark:text-zinc-600"
        }`}
      >
        {icon}
      </div>

      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-500">
        {description}
      </p>
    </button>
  );
}

export default function ImportPage() {
  const router = useRouter();
  const { role, isRoleLoading } = useProjectRole();
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const inputId = useId();
  const [selectedMode, setSelectedMode] = useState<ImportMode>("baseline");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baselineExistsError, setBaselineExistsError] = useState(false);
  const [parsedRows, setParsedRows] = useState<PrimaveraExcelRow[] | null>(
    null,
  );
  const [dbImportResult, setDbImportResult] =
    useState<ImportActivitiesResponse | null>(null);
  const [showImportWarnings, setShowImportWarnings] = useState(false);

  useEffect(() => {
    document.title = "Import Activities";
  }, []);

  useEffect(() => {
    if (isRoleLoading) {
      return;
    }

    if (!hasRoleAccess(role, "import")) {
      router.push("/dashboard");
    }
  }, [role, isRoleLoading, router]);

  const previewRows = useMemo(
    () => (parsedRows ? parsedRows.slice(0, 5) : []),
    [parsedRows],
  );

  const clearImportMessages = useCallback(() => {
    setError(null);
    setBaselineExistsError(false);
    setDbImportResult(null);
    setShowImportWarnings(false);
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
    if (!activeProject) {
      setError("Select a project before importing to the database.");
      return;
    }

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
        body: JSON.stringify({
          rows: parsedRows,
          mode: selectedMode,
          project_id: activeProject.id,
        }),
      });

      const payload = (await response.json()) as ImportActivitiesResponse & {
        error?: string;
      };

      if (!response.ok) {
        const errorMessage =
          payload.error ?? "Failed to import activities to the database.";

        if (isBaselineAlreadyImportedError(errorMessage)) {
          setBaselineExistsError(true);
        }

        setDbImportResult(payload);
        throw new Error(errorMessage);
      }

      setDbImportResult(payload);
    } catch (importError) {
      const message =
        importError instanceof Error
          ? importError.message
          : "Failed to import activities to the database.";

      if (!isBaselineAlreadyImportedError(message)) {
        setError(message);
      }
    } finally {
      setIsSavingToDb(false);
    }
  }, [activeProject, clearImportMessages, parsedRows, selectedMode]);

  const handleSwitchToProgressUpdate = useCallback(() => {
    setSelectedMode("update");
    setBaselineExistsError(false);
    setError(null);
  }, []);

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
    dbImportResult.failedCount > 0 &&
    !baselineExistsError;

  if (isProjectLoading || isRoleLoading) {
    return (
      <ImportPageShell contentClassName="relative mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading project"
        />
      </ImportPageShell>
    );
  }

  if (!hasRoleAccess(role, "import")) {
    return (
      <ImportPageShell contentClassName="relative mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Checking access"
        />
      </ImportPageShell>
    );
  }

  if (!activeProject) {
    return (
      <ImportPageShell>
        <div className={`${IMPORT_FLOATING_CARD_CLASS} p-8 text-center`}>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-500">
            No project selected.
            <br />
            Please select a project to continue.
          </p>
          <Link
            href="/select-project"
            className={`mt-4 ${IMPORT_PRIMARY_BUTTON_CLASS}`}
          >
            Select Project
          </Link>
        </div>
      </ImportPageShell>
    );
  }

  return (
    <ImportPageShell>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Import Activities
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Upload a Primavera P6 Excel export. The descriptive header row is
          skipped automatically and activity data is read from row 3 onward.
        </p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 dark:bg-white/90 dark:text-zinc-700 dark:ring-zinc-200">
            {activeProject.code} — {activeProject.name}
          </span>
        </p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-300">
            Import Mode
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ModeCard
              title="Baseline Import"
              description="Import the original planned schedule. This can only be done once and cannot be changed."
              icon={<Shield className="h-5 w-5" aria-hidden="true" />}
              isSelected={selectedMode === "baseline"}
              onSelect={() => {
                setSelectedMode("baseline");
                clearImportMessages();
              }}
            />
            <ModeCard
              title="Progress Update"
              description="Import updated schedule with actual dates to recalculate progress and delays."
              icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
              isSelected={selectedMode === "update"}
              onSelect={() => {
                setSelectedMode("update");
                clearImportMessages();
              }}
            />
          </div>
        </div>

        {selectedMode === "baseline" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-300 dark:bg-amber-50 dark:text-amber-900">
            ⚠️ Warning: Baseline can only be imported once. Make sure your file is
            correct before importing. This action cannot be undone.
          </div>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-300 dark:bg-blue-50 dark:text-blue-900">
            <span className="inline-flex items-start gap-2">
              <BarChart3
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                This will update actual start/finish dates, recalculate progress
                % and delay days for all matching activities.
              </span>
            </span>
          </div>
        )}

        {baselineExistsError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-900 dark:border-red-300 dark:bg-red-50 dark:text-red-900">
            <p className="font-medium">
              Baseline has already been imported and is frozen.
            </p>
            <p className="mt-2">
              To import new progress data, select Progress Update instead.
            </p>
            <button
              type="button"
              onClick={handleSwitchToProgressUpdate}
              className={`mt-4 ${IMPORT_PRIMARY_BUTTON_CLASS}`}
            >
              Switch to Progress Update
            </button>
          </div>
        )}

        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed px-6 py-10 text-center shadow-lg transition-colors dark:shadow-xl dark:shadow-black/30 ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-50"
              : "border-zinc-300 bg-white dark:border-zinc-200/30 dark:bg-white/95"
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
            <div className="rounded-full bg-zinc-50 p-3 shadow-sm dark:bg-zinc-50">
              <svg
                aria-hidden="true"
                className="h-8 w-8 text-zinc-500 dark:text-zinc-500"
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
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-900">
                Drag and drop your Excel file here
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
                or{" "}
                <label
                  htmlFor={inputId}
                  className="cursor-pointer font-medium text-blue-600 hover:text-blue-700 dark:text-blue-600 dark:hover:text-blue-700"
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
          <div className={`${IMPORT_CARD_BASE} px-4 py-3`}>
            <p className="text-sm text-zinc-600 dark:text-zinc-500">Selected file</p>
            <p className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-900">
              {selectedFile.name}
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-300 dark:bg-red-50 dark:text-red-900">
            {error}
          </p>
        )}

        {dbImportSucceeded && dbImportResult && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-300 dark:bg-emerald-50 dark:text-emerald-900">
            {selectedMode === "baseline" ? (
              <>
                ✅ Baseline imported successfully.{" "}
                {dbImportResult.totalInserted} activit
                {dbImportResult.totalInserted === 1 ? "y" : "ies"} locked as
                baseline.
              </>
            ) : (
              <>
                ✅ Progress update imported successfully.{" "}
                {dbImportResult.totalInserted} activit
                {dbImportResult.totalInserted === 1 ? "y" : "ies"} updated with
                latest actuals.
              </>
            )}
          </p>
        )}

        {dbImportSucceeded &&
          dbImportResult?.warnings &&
          dbImportResult.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-300 dark:bg-amber-50">
              <button
                type="button"
                onClick={() => setShowImportWarnings((current) => !current)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-amber-900 dark:text-amber-900"
              >
                <span>
                  ⚠ {dbImportResult.warnings.length} validation warning
                  {dbImportResult.warnings.length === 1 ? "" : "s"}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                    showImportWarnings ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </button>

              {showImportWarnings && (
                <ul className="space-y-2 border-t border-amber-200 px-4 py-3 dark:border-amber-300">
                  {dbImportResult.warnings.map((warning) => (
                    <li
                      key={`${warning.activity_id}-${warning.warning}`}
                      className="text-sm text-amber-900 dark:text-amber-900"
                    >
                      <span className="font-mono text-xs">
                        {warning.activity_id}
                      </span>
                      <span className="mx-2 text-amber-700 dark:text-amber-700">
                        —
                      </span>
                      {warning.warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        {dbImportPartial && dbImportResult && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-300 dark:bg-amber-50 dark:text-amber-900">
            Partially imported {dbImportResult.totalInserted} of{" "}
            {dbImportResult.totalValidRows} valid rows.{" "}
            {dbImportResult.failedCount} row
            {dbImportResult.failedCount === 1 ? "" : "s"} failed.
          </p>
        )}

        {dbImportFailed && dbImportResult && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-300 dark:bg-red-50 dark:text-red-900">
            Import failed. {dbImportResult.failedCount} of{" "}
            {dbImportResult.totalValidRows} valid rows could not be inserted.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedFile || isImporting || isSavingToDb}
            className={IMPORT_SECONDARY_BUTTON_CLASS}
          >
            {isImporting ? "Parsing..." : "Parse Excel"}
          </button>

          <button
            type="button"
            onClick={handleImportToDatabase}
            disabled={!parsedRows?.length || isImporting || isSavingToDb}
            className={IMPORT_PRIMARY_BUTTON_CLASS}
          >
            {isSavingToDb ? "Saving to Database..." : "Import to Database"}
          </button>
        </div>

        {parsedRows && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-300 dark:bg-emerald-50 dark:text-emerald-900">
              Parsed {parsedRows.length} valid activity{" "}
              {parsedRows.length === 1 ? "row" : "rows"} from the first sheet.
            </div>

            {previewRows.length > 0 ? (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">
                  Preview (first 5 rows)
                </h2>
                <div className={IMPORT_TABLE_CARD_CLASS}>
                  <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        {PREVIEW_COLUMNS.map((column) => (
                          <th
                            key={column}
                            className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-900"
                          >
                            {PREVIEW_COLUMN_LABELS[column] ?? column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {previewRows.map((row, rowIndex) => (
                        <tr
                          key={`${normalizePreviewKey(row)}-${rowIndex}`}
                          className="hover:bg-zinc-50"
                        >
                          {PREVIEW_COLUMNS.map((column) => (
                            <td
                              key={`${rowIndex}-${column}`}
                              className="max-w-xs truncate px-4 py-3 text-zinc-900 dark:text-zinc-900"
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
              <p className={`${IMPORT_CARD_BASE} px-4 py-3 text-sm text-zinc-600 dark:text-zinc-500`}>
                No valid activity rows were found in the first sheet.
              </p>
            )}
          </div>
        )}
      </div>
    </ImportPageShell>
  );
}

