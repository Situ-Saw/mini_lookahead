"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const CONSTRAINT_TYPES = [
  "Drawing",
  "Material",
  "Labour",
  "Equipment",
  "Approval",
  "RFI",
  "Client Decision",
] as const;

const STATUS_OPTIONS = ["Open", "Closed"] as const;

type ConstraintStatus = (typeof STATUS_OPTIONS)[number];
type StatusFilter = "All" | ConstraintStatus;

type Constraint = {
  id: string;
  activity_id: string | null;
  constraint_type: string;
  description: string;
  status: string;
  target_removal_date: string | null;
  raised_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

type ConstraintFormState = {
  activity_id: string;
  constraint_type: string;
  description: string;
  status: ConstraintStatus;
  target_removal_date: string;
  raised_by: string;
  remarks: string;
};

const EMPTY_FORM: ConstraintFormState = {
  activity_id: "",
  constraint_type: CONSTRAINT_TYPES[0],
  description: "",
  status: "Open",
  target_removal_date: "",
  raised_by: "",
  remarks: "",
};

function formatDate(value: string | null): string {
  if (!value) return "—";

  const datePart = value.split("T")[0];
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCell(value: string | null): string {
  if (!value) return "—";
  return value;
}

function constraintToForm(constraint: Constraint): ConstraintFormState {
  return {
    activity_id: constraint.activity_id ?? "",
    constraint_type: constraint.constraint_type,
    description: constraint.description,
    status: constraint.status === "Closed" ? "Closed" : "Open",
    target_removal_date: constraint.target_removal_date?.split("T")[0] ?? "",
    raised_by: constraint.raised_by ?? "",
    remarks: constraint.remarks ?? "",
  };
}

function formToPayload(form: ConstraintFormState) {
  return {
    activity_id: form.activity_id.trim() || null,
    constraint_type: form.constraint_type,
    description: form.description.trim(),
    status: form.status,
    target_removal_date: form.target_removal_date || null,
    raised_by: form.raised_by.trim() || null,
    remarks: form.remarks.trim() || null,
  };
}

function StatusBadge({ status }: { status: string }) {
  const isOpen = status === "Open";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
        isOpen
          ? "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900"
          : "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900"
      }`}
    >
      {status}
    </span>
  );
}

function FilterButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </button>
  );
}

function ConstraintModal({
  mode,
  form,
  isSaving,
  saveError,
  editingConstraint,
  onChange,
  onCancel,
  onSave,
}: {
  mode: "add" | "edit";
  form: ConstraintFormState;
  isSaving: boolean;
  saveError: string | null;
  editingConstraint: Constraint | null;
  onChange: (updates: Partial<ConstraintFormState>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={isSaving ? undefined : onCancel}
        disabled={isSaving}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="constraint-modal-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h2
          id="constraint-modal-title"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
        >
          {mode === "add" ? "Add Constraint" : "Edit Constraint"}
        </h2>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="constraint-activity-id"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Activity ID
            </label>
            <input
              id="constraint-activity-id"
              type="text"
              value={form.activity_id}
              disabled={isSaving}
              onChange={(event) => onChange({ activity_id: event.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="constraint-type"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Constraint Type <span className="text-red-500">*</span>
            </label>
            <select
              id="constraint-type"
              value={form.constraint_type}
              disabled={isSaving}
              onChange={(event) =>
                onChange({ constraint_type: event.target.value })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {CONSTRAINT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="constraint-description"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="constraint-description"
              value={form.description}
              disabled={isSaving}
              onChange={(event) => onChange({ description: event.target.value })}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="constraint-status"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Status
            </label>
            <select
              id="constraint-status"
              value={form.status}
              disabled={isSaving}
              onChange={(event) =>
                onChange({
                  status: event.target.value as ConstraintStatus,
                })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="constraint-target-date"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Target Removal Date
            </label>
            <input
              id="constraint-target-date"
              type="date"
              value={form.target_removal_date}
              disabled={isSaving}
              onChange={(event) =>
                onChange({ target_removal_date: event.target.value })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="constraint-raised-by"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Raised By
            </label>
            <input
              id="constraint-raised-by"
              type="text"
              value={form.raised_by}
              disabled={isSaving}
              onChange={(event) => onChange({ raised_by: event.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="constraint-remarks"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Remarks
            </label>
            <textarea
              id="constraint-remarks"
              value={form.remarks}
              disabled={isSaving}
              onChange={(event) => onChange({ remarks: event.target.value })}
              rows={2}
              placeholder="Optional"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          {mode === "edit" && editingConstraint && (
            <div className="rounded-lg bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900/60">
              <p className="text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Created At:
                </span>{" "}
                {formatDateTime(editingConstraint.created_at)}
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Updated At:
                </span>{" "}
                {formatDateTime(editingConstraint.updated_at)}
              </p>
            </div>
          )}
        </div>

        {saveError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {saveError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConstraintsPage() {
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingConstraint, setEditingConstraint] = useState<Constraint | null>(
    null,
  );
  const [form, setForm] = useState<ConstraintFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = "Constraint Register";
  }, []);

  const loadConstraints = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("constraints")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setFetchError(error.message);
      setConstraints([]);
    } else {
      setConstraints((data ?? []) as Constraint[]);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadConstraints();
  }, [loadConstraints]);

  const totalConstraints = constraints.length;
  const openConstraints = constraints.filter((c) => c.status === "Open").length;
  const closedConstraints = constraints.filter(
    (c) => c.status === "Closed",
  ).length;

  const filteredConstraints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return constraints.filter((constraint) => {
      if (statusFilter !== "All" && constraint.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      const activityId = (constraint.activity_id ?? "").toLowerCase();
      const description = constraint.description.toLowerCase();
      return activityId.includes(query) || description.includes(query);
    });
  }, [constraints, searchQuery, statusFilter]);

  const openAddModal = () => {
    setModalMode("add");
    setEditingConstraint(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (constraint: Constraint) => {
    setModalMode("edit");
    setEditingConstraint(constraint);
    setForm(constraintToForm(constraint));
    setSaveError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingConstraint(null);
    setSaveError(null);
    setForm(EMPTY_FORM);
  };

  const handleFormChange = (updates: Partial<ConstraintFormState>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleSave = async () => {
    if (!form.constraint_type.trim()) {
      setSaveError("Constraint type is required.");
      return;
    }

    if (!form.description.trim()) {
      setSaveError("Description is required.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const payload = formToPayload(form);
    const now = new Date().toISOString();

    if (modalMode === "add") {
      const { data, error } = await supabase
        .from("constraints")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }

      setConstraints((current) => [data as Constraint, ...current]);
    } else if (editingConstraint) {
      const { data, error } = await supabase
        .from("constraints")
        .update({ ...payload, updated_at: now })
        .eq("id", editingConstraint.id)
        .select("*")
        .single();

      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }

      setConstraints((current) =>
        current.map((constraint) =>
          constraint.id === editingConstraint.id
            ? (data as Constraint)
            : constraint,
        ),
      );
    }

    setIsSaving(false);
    setIsModalOpen(false);
    setEditingConstraint(null);
    setForm(EMPTY_FORM);
  };

  const handleCloseConstraint = async (constraint: Constraint) => {
    setRowActionId(constraint.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[constraint.id];
      return next;
    });

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("constraints")
      .update({ status: "Closed", updated_at: now })
      .eq("id", constraint.id)
      .select("*")
      .single();

    setRowActionId(null);
    setConfirmCloseId(null);

    if (error) {
      setRowErrors((current) => ({
        ...current,
        [constraint.id]: error.message,
      }));
      return;
    }

    setConstraints((current) =>
      current.map((item) =>
        item.id === constraint.id ? (data as Constraint) : item,
      ),
    );
  };

  const handleDeleteConstraint = async (constraint: Constraint) => {
    setRowActionId(constraint.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[constraint.id];
      return next;
    });

    const { error } = await supabase
      .from("constraints")
      .delete()
      .eq("id", constraint.id);

    setRowActionId(null);
    setConfirmDeleteId(null);

    if (error) {
      setRowErrors((current) => ({
        ...current,
        [constraint.id]: error.message,
      }));
      return;
    }

    setConstraints((current) =>
      current.filter((item) => item.id !== constraint.id),
    );
  };

  if (fetchError) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Constraint Register
        </h1>
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          Failed to load constraints: {fetchError}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Constraint Register
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Track and manage construction constraints linked to activities.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Add Constraint
        </button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Total Constraints
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {isLoading ? "—" : totalConstraints.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Open Constraints
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-100">
            {isLoading ? "—" : openConstraints.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Closed Constraints
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-900 dark:text-emerald-100">
            {isLoading ? "—" : closedConstraints.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:max-w-md">
          <label
            htmlFor="constraint-search"
            className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Search constraints
          </label>
          <input
            id="constraint-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by Activity ID or Description"
            disabled={isLoading}
            className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none ring-blue-500 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Status:
          </span>
          <FilterButton
            label="All"
            isActive={statusFilter === "All"}
            onClick={() => setStatusFilter("All")}
          />
          <FilterButton
            label="Open"
            isActive={statusFilter === "Open"}
            onClick={() => setStatusFilter("Open")}
          />
          <FilterButton
            label="Closed"
            isActive={statusFilter === "Closed"}
            onClick={() => setStatusFilter("Closed")}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          Loading constraints...
        </p>
      ) : constraints.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No constraints found. Add your first constraint.
        </p>
      ) : filteredConstraints.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
          No constraints match your search.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 text-left text-sm dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Activity ID
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Constraint Type
                </th>
                <th className="min-w-[12rem] px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Description
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Raised By
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Status
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Target Removal Date
                </th>
                <th className="min-w-[8rem] px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Remarks
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Created At
                </th>
                <th className="min-w-[12rem] px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-100">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
              {filteredConstraints.map((constraint) => {
                const isRowBusy = rowActionId === constraint.id;
                const isConfirmingClose = confirmCloseId === constraint.id;
                const isConfirmingDelete = confirmDeleteId === constraint.id;

                return (
                  <tr
                    key={constraint.id}
                    className="align-top transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {formatCell(constraint.activity_id)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {constraint.constraint_type}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      <p className="line-clamp-2" title={constraint.description}>
                        {constraint.description}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatCell(constraint.raised_by)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={constraint.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDate(constraint.target_removal_date)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      <p
                        className="line-clamp-2"
                        title={constraint.remarks ?? undefined}
                      >
                        {formatCell(constraint.remarks)}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDateTime(constraint.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {isConfirmingClose ? (
                        <div className="space-y-2">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Are you sure?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => void handleCloseConstraint(constraint)}
                              className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              {isRowBusy ? "Closing..." : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => setConfirmCloseId(null)}
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : isConfirmingDelete ? (
                        <div className="space-y-2">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Are you sure?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() =>
                                void handleDeleteConstraint(constraint)
                              }
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {isRowBusy ? "Deleting..." : "Confirm"}
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => openEditModal(constraint)}
                            className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                          >
                            Edit
                          </button>
                          {constraint.status === "Open" && (
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setConfirmCloseId(constraint.id);
                                setRowErrors((current) => {
                                  const next = { ...current };
                                  delete next[constraint.id];
                                  return next;
                                });
                              }}
                              className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                              Close
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isRowBusy}
                            onClick={() => {
                              setConfirmCloseId(null);
                              setConfirmDeleteId(constraint.id);
                              setRowErrors((current) => {
                                const next = { ...current };
                                delete next[constraint.id];
                                return next;
                              });
                            }}
                            className="rounded-md border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      {rowErrors[constraint.id] && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                          {rowErrors[constraint.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <ConstraintModal
          mode={modalMode}
          form={form}
          isSaving={isSaving}
          saveError={saveError}
          editingConstraint={editingConstraint}
          onChange={handleFormChange}
          onCancel={closeModal}
          onSave={() => void handleSave()}
        />
      )}
    </main>
  );
}
