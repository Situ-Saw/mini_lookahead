"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { displayUserId } from "@/lib/admin/credentials";
import { useActiveProject } from "@/lib/hooks/useActiveProject";
import { useProjectRole } from "@/lib/hooks/useProjectRole";

type TabId = "create" | "reassign" | "members";

type TeamRole = "site_engineer" | "viewer";

type EngineerOption = {
  user_id: string;
  name: string;
};

type CreatedCredentials = {
  user_id: string;
  new_user_id: string;
  password: string;
  email: string;
  warning?: string;
};

type TeamMember = {
  user_id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  joined_at: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "create", label: "Add Member" },
  { id: "reassign", label: "Reassign User" },
  { id: "members", label: "Team Members" },
];

const ROLE_OPTIONS: Array<{ value: TeamRole; label: string }> = [
  { value: "site_engineer", label: "Site Engineer" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  planner: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  site_engineer:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  viewer: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function normalizeTeamMember(row: Record<string, unknown>): TeamMember | null {
  const userId = row.user_id;
  const role = row.role;
  const joinedAt = row.joined_at;

  if (typeof userId !== "string" || typeof role !== "string") {
    return null;
  }

  const profiles = row.profiles;
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as Record<string, unknown>)
      : (profiles as Record<string, unknown> | null);

  if (
    !profile ||
    typeof profile.name !== "string" ||
    typeof profile.email !== "string"
  ) {
    return null;
  }

  return {
    user_id: userId,
    name: profile.name,
    email: profile.email,
    role,
    is_active:
      typeof profile.is_active === "boolean" ? profile.is_active : true,
    joined_at: typeof joinedAt === "string" ? joinedAt : "",
  };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const { activeProject, isLoading: isProjectLoading } = useActiveProject();
  const { role, isRoleLoading } = useProjectRole();

  const [activeTab, setActiveTab] = useState<TabId>("create");

  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<TeamRole>("site_engineer");
  const [createEngineerId, setCreateEngineerId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createWarning, setCreateWarning] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedCredentials | null>(null);

  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignRole, setReassignRole] = useState<TeamRole>("site_engineer");
  const [reassignEngineerId, setReassignEngineerId] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [reassignWarning, setReassignWarning] = useState<string | null>(null);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [engineerOptions, setEngineerOptions] = useState<EngineerOption[]>([]);
  const [isLoadingEngineers, setIsLoadingEngineers] = useState(false);

  useEffect(() => {
    if (isRoleLoading) {
      return;
    }

    if (!role || !["admin", "planner"].includes(role)) {
      router.push("/dashboard");
    }
  }, [role, isRoleLoading, router]);

  const loadSiteEngineers = useCallback(async (projectId: string) => {
    setIsLoadingEngineers(true);

    const supabase = createClient();
    const { data: members, error: membersError } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("role", "site_engineer");

    if (membersError) {
      console.error("Failed to load site engineers:", membersError.message);
      setEngineerOptions([]);
      setIsLoadingEngineers(false);
      return;
    }

    const userIds = (members ?? [])
      .map((member) => member.user_id)
      .filter((userId): userId is string => typeof userId === "string");

    if (userIds.length === 0) {
      setEngineerOptions([]);
      setIsLoadingEngineers(false);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", userIds)
      .order("name");

    if (profilesError) {
      console.error("Failed to load engineer profiles:", profilesError.message);
      setEngineerOptions([]);
      setIsLoadingEngineers(false);
      return;
    }

    setEngineerOptions(
      (profiles ?? []).map((profile) => ({
        user_id: String(profile.id),
        name: String(profile.name ?? "Unknown"),
      })),
    );
    setIsLoadingEngineers(false);
  }, []);

  const loadTeamMembers = useCallback(async (projectId: string) => {
    setIsLoadingMembers(true);
    setMembersError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("project_members")
      .select("user_id, role, joined_at, profiles(name, email, is_active)")
      .eq("project_id", projectId);

    if (error) {
      console.error("Failed to load team members:", error.message);
      setMembersError(error.message);
      setTeamMembers([]);
      setIsLoadingMembers(false);
      return;
    }

    const normalized = (data ?? [])
      .map((row) => normalizeTeamMember(row as Record<string, unknown>))
      .filter((member): member is TeamMember => member !== null)
      .sort((left, right) => {
        const roleCompare = left.role.localeCompare(right.role);
        if (roleCompare !== 0) {
          return roleCompare;
        }
        return left.name.localeCompare(right.name);
      });

    setTeamMembers(normalized);
    setIsLoadingMembers(false);
  }, []);

  useEffect(() => {
    if (!activeProject) {
      setEngineerOptions([]);
      return;
    }

    void loadSiteEngineers(activeProject.id);
  }, [activeProject, loadSiteEngineers]);

  useEffect(() => {
    if (!activeProject || activeTab !== "members") {
      return;
    }

    void loadTeamMembers(activeProject.id);
  }, [activeProject, activeTab, loadTeamMembers]);

  useEffect(() => {
    if (createRole !== "viewer") {
      setCreateEngineerId("");
    }
  }, [createRole]);

  useEffect(() => {
    if (reassignRole !== "viewer") {
      setReassignEngineerId("");
    }
  }, [reassignRole]);

  const handleCreateMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeProject) {
      return;
    }

    setCreateError(null);
    setCreateWarning(null);
    setCreatedCredentials(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/planner/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          role: createRole,
          project_id: activeProject.id,
          engineer_id:
            createRole === "viewer" ? createEngineerId || undefined : undefined,
        }),
      });

      const payload = (await response.json()) as CreatedCredentials & {
        error?: string;
      };

      if (!response.ok) {
        setCreateError(payload.error ?? "Failed to create team member.");
        return;
      }

      if (payload.warning) {
        setCreateWarning(payload.warning);
      }

      setCreatedCredentials({
        user_id: payload.user_id,
        new_user_id: payload.new_user_id,
        password: payload.password,
        email: payload.email,
        warning: payload.warning,
      });
      setCreateName("");
      setCreateEngineerId("");

      if (activeTab === "members") {
        void loadTeamMembers(activeProject.id);
      }
    } catch {
      setCreateError("Failed to create team member. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleReassignUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeProject) {
      return;
    }

    setReassignError(null);
    setReassignSuccess(null);
    setReassignWarning(null);
    setIsReassigning(true);

    try {
      const response = await fetch("/api/planner/reassign-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id_display: reassignUserId,
          role: reassignRole,
          project_id: activeProject.id,
          engineer_id:
            reassignRole === "viewer"
              ? reassignEngineerId || undefined
              : undefined,
        }),
      });

      const payload = (await response.json()) as {
        name?: string;
        role?: string;
        message?: string;
        warning?: string;
        error?: string;
      };

      if (!response.ok) {
        setReassignError(payload.error ?? "Failed to reassign user.");
        return;
      }

      if (payload.warning) {
        setReassignWarning(payload.warning);
      }

      setReassignSuccess(
        `User ${payload.name ?? reassignUserId} added to project as ${formatRole(payload.role ?? reassignRole)}`,
      );
      setReassignUserId("");
      setReassignEngineerId("");

      if (activeTab === "members") {
        void loadTeamMembers(activeProject.id);
      }
    } catch {
      setReassignError("Failed to reassign user. Please try again.");
    } finally {
      setIsReassigning(false);
    }
  };

  if (isRoleLoading || isProjectLoading) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Loading"
        />
      </main>
    );
  }

  if (!role || !["admin", "planner"].includes(role)) {
    return (
      <main className="mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2
          className="h-8 w-8 animate-spin text-zinc-400"
          aria-label="Redirecting"
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

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Team Management
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Manage team members for {activeProject.name}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "create" && (
        <section className="max-w-xl">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Add Member
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Create a new Site Engineer or Viewer for this project.
          </p>

          <form onSubmit={handleCreateMember} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="create-name"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Full Name
              </label>
              <input
                id="create-name"
                type="text"
                required
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                disabled={isCreating}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="create-role"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role
              </label>
              <select
                id="create-role"
                value={createRole}
                onChange={(event) =>
                  setCreateRole(event.target.value as TeamRole)
                }
                disabled={isCreating}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {createRole === "viewer" && (
              <div>
                <label
                  htmlFor="create-engineer"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Assign to Site Engineer
                </label>
                <select
                  id="create-engineer"
                  required
                  value={createEngineerId}
                  onChange={(event) => setCreateEngineerId(event.target.value)}
                  disabled={
                    isCreating ||
                    isLoadingEngineers ||
                    engineerOptions.length === 0
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="" disabled>
                    {isLoadingEngineers
                      ? "Loading engineers..."
                      : engineerOptions.length === 0
                        ? "No Site Engineers in project"
                        : "Select Site Engineer..."}
                  </option>
                  {engineerOptions.map((engineer) => (
                    <option key={engineer.user_id} value={engineer.user_id}>
                      {engineer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {createError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {createError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isCreating ||
                (createRole === "viewer" && !createEngineerId)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {isCreating && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isCreating ? "Creating..." : "Create Member"}
            </button>
          </form>

          {createdCredentials && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
              <p className="text-sm font-semibold text-green-900 dark:text-green-200">
                User created successfully
              </p>
              {createWarning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  {createWarning}
                </p>
              )}
              <p className="mt-3 text-xs text-green-800 dark:text-green-300">
                Save these credentials — password cannot be recovered
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="font-medium text-green-900 dark:text-green-200">
                    User ID
                  </dt>
                  <dd className="flex items-center gap-2 font-mono text-green-800 dark:text-green-300">
                    {createdCredentials.user_id}
                    <CopyButton
                      value={createdCredentials.user_id}
                      label="User ID"
                    />
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="font-medium text-green-900 dark:text-green-200">
                    Password
                  </dt>
                  <dd className="flex items-center gap-2 font-mono text-green-800 dark:text-green-300">
                    {createdCredentials.password}
                    <CopyButton
                      value={createdCredentials.password}
                      label="Password"
                    />
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      )}

      {activeTab === "reassign" && (
        <section className="max-w-xl">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Reassign User
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Add an existing user to this project with a chosen role.
          </p>

          <form onSubmit={handleReassignUser} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="reassign-user-id"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                User ID
              </label>
              <input
                id="reassign-user-id"
                type="text"
                required
                placeholder="e.g. BSL-ENG-0001"
                value={reassignUserId}
                onChange={(event) => setReassignUserId(event.target.value)}
                disabled={isReassigning}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label
                htmlFor="reassign-role"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Role in this project
              </label>
              <select
                id="reassign-role"
                value={reassignRole}
                onChange={(event) =>
                  setReassignRole(event.target.value as TeamRole)
                }
                disabled={isReassigning}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {reassignRole === "viewer" && (
              <div>
                <label
                  htmlFor="reassign-engineer"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Assign to Site Engineer
                </label>
                <select
                  id="reassign-engineer"
                  required
                  value={reassignEngineerId}
                  onChange={(event) =>
                    setReassignEngineerId(event.target.value)
                  }
                  disabled={
                    isReassigning ||
                    isLoadingEngineers ||
                    engineerOptions.length === 0
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="" disabled>
                    {isLoadingEngineers
                      ? "Loading engineers..."
                      : engineerOptions.length === 0
                        ? "No Site Engineers in project"
                        : "Select Site Engineer..."}
                  </option>
                  {engineerOptions.map((engineer) => (
                    <option key={engineer.user_id} value={engineer.user_id}>
                      {engineer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reassignError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {reassignError}
              </p>
            )}

            {reassignSuccess && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200">
                {reassignSuccess}
              </p>
            )}

            {reassignWarning && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                {reassignWarning}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isReassigning ||
                (reassignRole === "viewer" && !reassignEngineerId)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {isReassigning && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isReassigning ? "Adding..." : "Add to Project"}
            </button>
          </form>
        </section>
      )}

      {activeTab === "members" && (
        <section>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Team Members
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            All members assigned to this project.
          </p>

          {membersError && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              Failed to load team members: {membersError}
            </p>
          )}

          {isLoadingMembers ? (
            <div className="mt-8 flex justify-center">
              <Loader2
                className="h-8 w-8 animate-spin text-zinc-400"
                aria-label="Loading team members"
              />
            </div>
          ) : teamMembers.length === 0 ? (
            <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
              No team members yet.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                      User ID
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                      Role
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-left font-semibold text-zinc-900 dark:text-zinc-100">
                      Joined
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {teamMembers.map((member) => (
                    <tr key={member.user_id}>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-900 dark:text-zinc-100">
                        {member.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-zinc-700 dark:text-zinc-300">
                        {displayUserId(member.email)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            ROLE_BADGE_STYLES[member.role] ??
                            ROLE_BADGE_STYLES.viewer
                          }`}
                        >
                          {formatRole(member.role)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            member.is_active
                              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                              : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          }`}
                        >
                          {member.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {member.joined_at
                          ? formatDate(member.joined_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
