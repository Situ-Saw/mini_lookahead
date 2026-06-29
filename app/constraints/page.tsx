"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useActiveProject } from "@/lib/hooks/useActiveProject";

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
  assigned_to: string | null;
  assigned_to_name: string | null;
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
  assigned_to: string;
  remarks: string;
};

const EMPTY_FORM: ConstraintFormState = {
  activity_id: "",
  constraint_type: CONSTRAINT_TYPES[0],
  description: "",
  status: "Open",
  target_removal_date: "",
  raised_by: "",
  assigned_to: "",
  remarks: "",
};

type ProjectMember = {
  user_id: string;
  name: string;
  role: string;
};

type ActivityOption = {
  activity_id: string;
  activity_name: string;
};

const ACTIVITY_FIELD_INPUT_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

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
    assigned_to: constraint.assigned_to ?? "",
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
    assigned_to: form.assigned_to || null,
    remarks: form.remarks.trim() || null,
  };
}

function normalizeConstraint(
  row: Record<string, unknown>,
  nameMap: Record<string, string> = {},
): Constraint | null {
  if (typeof row.id !== "string") {
    return null;
  }

  const assignedTo =
    typeof row.assigned_to === "string" ? row.assigned_to : null;

  return {
    id: row.id,
    activity_id:
      typeof row.activity_id === "string" ? row.activity_id : null,
    constraint_type: String(row.constraint_type ?? ""),
    description: String(row.description ?? ""),
    status: String(row.status ?? "Open"),
    target_removal_date:
      typeof row.target_removal_date === "string"
        ? row.target_removal_date
        : null,
    raised_by: typeof row.raised_by === "string" ? row.raised_by : null,
    assigned_to: assignedTo,
    assigned_to_name: assignedTo ? (nameMap[assignedTo] ?? "Unknown") : null,
    remarks: typeof row.remarks === "string" ? row.remarks : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function withAssigneeName(
  constraint: Constraint,
  members: ProjectMember[],
): Constraint {
  if (!constraint.assigned_to) {
    return { ...constraint, assigned_to_name: null };
  }

  const member = members.find(
    (entry) => entry.user_id === constraint.assigned_to,
  );

  return {
    ...constraint,
    assigned_to_name: member?.name ?? "Unknown",
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

function formatActivityOption(option: ActivityOption): string {
  return `${option.activity_id} — ${option.activity_name}`;
}

function ActivityIdField({
  value,
  onChange,
  disabled,
  projectId,
}: {
  value: string;
  onChange: (activityId: string) => void;
  disabled: boolean;
  projectId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadActivities() {
      setIsLoading(true);
      setLoadError(null);

      const { data, error } = await supabase
        .from("activities")
        .select("activity_id, activity_name")
        .eq("project_id", projectId)
        .order("activity_id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setLoadError(error.message);
        setActivities([]);
      } else {
        setActivities((data ?? []) as ActivityOption[]);
      }

      setIsLoading(false);
    }

    void loadActivities();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.activity_id === value),
    [activities, value],
  );

  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return activities;

    return activities.filter((activity) => {
      const activityId = activity.activity_id.toLowerCase();
      const activityName = activity.activity_name.toLowerCase();
      return (
        activityId.includes(normalizedQuery) ||
        activityName.includes(normalizedQuery)
      );
    });
  }, [activities, query]);

  const displayValue = isOpen
    ? query
    : selectedActivity
      ? formatActivityOption(selectedActivity)
      : value;

  const handleSelect = (activityId: string) => {
    onChange(activityId);
    setQuery("");
    setIsOpen(false);
  };

  return (
    <div>
      <label
        htmlFor="constraint-activity-id"
        className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Activity ID
      </label>

      {loadError ? (
        <>
          <input
            id="constraint-activity-id"
            type="text"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Optional"
            className={ACTIVITY_FIELD_INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
            Could not load activities. You can type an Activity ID manually.
          </p>
        </>
      ) : (
        <div ref={containerRef} className="relative">
          <input
            id="constraint-activity-id"
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls="constraint-activity-listbox"
            value={displayValue}
            disabled={disabled || isLoading}
            placeholder={
              isLoading
                ? "Loading activities..."
                : "Search by Activity ID or Name"
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
              if (!event.target.value.trim()) {
                onChange("");
              }
            }}
            onFocus={() => {
              if (!isLoading) {
                setIsOpen(true);
                setQuery(
                  selectedActivity
                    ? formatActivityOption(selectedActivity)
                    : value,
                );
              }
            }}
            className={ACTIVITY_FIELD_INPUT_CLASS}
          />

          {isOpen && !isLoading && (
            <ul
              id="constraint-activity-listbox"
              role="listbox"
              className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
            >
              <li>
                <button
                  type="button"
                  role="option"
                  onClick={() => handleSelect("")}
                  className="w-full px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  No activity link
                </button>
              </li>

              {filteredActivities.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  No matching activities
                </li>
              ) : (
                filteredActivities.map((activity) => (
                  <li key={activity.activity_id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === activity.activity_id}
                      onClick={() => handleSelect(activity.activity_id)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                        value === activity.activity_id
                          ? "bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {formatActivityOption(activity)}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ConstraintModal({
  mode,
  form,
  isSaving,
  saveError,
  editingConstraint,
  projectId,
  projectMembers,
  onChange,
  onCancel,
  onSave,
}: {
  mode: "add" | "edit";
  form: ConstraintFormState;
  isSaving: boolean;
  saveError: string | null;
  editingConstraint: Constraint | null;
  projectId: string;
  projectMembers: ProjectMember[];
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
          <ActivityIdField
            value={form.activity_id}
            disabled={isSaving}
            projectId={projectId}
            onChange={(activityId) => onChange({ activity_id: activityId })}
          />

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
              htmlFor="constraint-assigned-to"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Assigned To
              <span className="ml-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                (responsible for clearing)
              </span>
            </label>
            <select
              id="constraint-assigned-to"
              value={form.assigned_to}
              disabled={isSaving}
              onChange={(event) =>
                onChange({ assigned_to: event.target.value })
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              <option value="">Unassigned</option>
              {projectMembers.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.name} ({member.role.replace("_", " ")})
                </option>
              ))}
            </select>
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
              disabled
              placeholder="Optional"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Auto-filled from your account. Cannot be changed.
            </p>
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
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
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
  const [currentUserName, setCurrentUserName] = useState("");
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    document.title = "Constraint Register";
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUserName() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          if (authError) {
            console.error("Failed to get current user:", authError.message);
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Failed to load profile name:", profileError.message);
          return;
        }

        if (!cancelled && typeof profile?.name === "string") {
          setCurrentUserName(profile.name);
        }
      } catch (error) {
        console.error("Failed to load current user name:", error);
      }
    }

    void loadCurrentUserName();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadConstraints = useCallback(async (projectId: string) => {
    setIsLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from("constraints")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      setFetchError(error.message);
      setConstraints([]);
      setIsLoading(false);
      return;
    }

    const rows = data ?? [];
    const assignedUserIds = [
      ...new Set(
        rows
          .map((row) => row.assigned_to)
          .filter((userId): userId is string => typeof userId === "string"),
      ),
    ];

    const nameMap: Record<string, string> = {};

    if (assignedUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", assignedUserIds);

      if (profilesError) {
        console.error(
          "Failed to load assignee profiles:",
          profilesError.message,
        );
      } else {
        for (const profile of profiles ?? []) {
          if (typeof profile.id === "string") {
            nameMap[profile.id] = String(profile.name ?? "Unknown");
          }
        }
      }
    }

    const normalizedConstraints = rows
      .map((row) => normalizeConstraint(row as Record<string, unknown>, nameMap))
      .filter((row): row is Constraint => row !== null);

    setConstraints(normalizedConstraints);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    void loadConstraints(activeProject.id);
  }, [loadConstraints, activeProject]);

  useEffect(() => {
    if (!activeProject) {
      setProjectMembers([]);
      return;
    }

    const projectId = activeProject.id;
    let cancelled = false;

    async function loadProjectMembers() {
      const { data: members, error: membersError } = await supabase
        .from("project_members")
        .select("user_id, role")
        .eq("project_id", projectId)
        .in("role", ["admin", "planner", "site_engineer"])
        .order("user_id");

      if (cancelled) {
        return;
      }

      if (membersError) {
        console.error("Failed to load project members:", membersError.message);
        setProjectMembers([]);
        return;
      }

      const memberRows = members ?? [];
      const userIds = memberRows
        .map((member) => member.user_id)
        .filter((userId): userId is string => typeof userId === "string");

      if (userIds.length === 0) {
        setProjectMembers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds)
        .order("name");

      if (cancelled) {
        return;
      }

      if (profilesError) {
        console.error(
          "Failed to load project member profiles:",
          profilesError.message,
        );
        setProjectMembers([]);
        return;
      }

      const nameByUserId = new Map(
        (profiles ?? []).map((profile) => [
          String(profile.id),
          String(profile.name ?? "Unknown"),
        ]),
      );

      const normalizedMembers = memberRows
        .map((member) => {
          if (typeof member.user_id !== "string") {
            return null;
          }

          return {
            user_id: member.user_id,
            name: nameByUserId.get(member.user_id) ?? "Unknown",
            role: String(member.role ?? ""),
          };
        })
        .filter((member): member is ProjectMember => member !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      setProjectMembers(normalizedMembers);
    }

    void loadProjectMembers();

    return () => {
      cancelled = true;
    };
  }, [activeProject]);

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
    setForm({ ...EMPTY_FORM, raised_by: currentUserName });
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

  const handleSave = useCallback(async () => {
    if (!activeProject) return;

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

    const payload = {
      ...formToPayload(form),
      project_id: activeProject.id,
    };
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

      const saved = normalizeConstraint(
        data as Record<string, unknown>,
        {},
      );
      if (saved) {
        setConstraints((current) => [
          withAssigneeName(saved, projectMembers),
          ...current,
        ]);
      }
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

      const saved = normalizeConstraint(
        data as Record<string, unknown>,
        {},
      );
      if (saved) {
        setConstraints((current) =>
          current.map((constraint) =>
            constraint.id === editingConstraint.id
              ? withAssigneeName(saved, projectMembers)
              : constraint,
          ),
        );
      }
    }

    setIsSaving(false);
    setIsModalOpen(false);
    setEditingConstraint(null);
    setForm(EMPTY_FORM);
  }, [activeProject, editingConstraint, form, modalMode, projectMembers]);

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

  if (isProjectLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading project"
        />
      </main>
    );
  }

  if (!activeProject) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            No project selected.
            <br />
            Please select a project to continue.
          </p>
          <Link
            href="/select-project"
            className="mt-4 inline-flex rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Select Project
          </Link>
        </div>
      </main>
    );
  }

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
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {activeProject.code} — {activeProject.name}
            </span>
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
                  Assigned To
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
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {constraint.assigned_to_name ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
                          {constraint.assigned_to_name}
                        </span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">
                          —
                        </span>
                      )}
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
          projectId={activeProject.id}
          projectMembers={projectMembers}
          onChange={handleFormChange}
          onCancel={closeModal}
          onSave={() => void handleSave()}
        />
      )}
    </main>
  );
}
