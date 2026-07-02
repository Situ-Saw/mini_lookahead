"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  type AppRole,
  displayUserId,
} from "@/lib/admin/credentials";

type TabId = "create-user" | "create-project" | "all-users" | "all-projects";

type ProjectOption = {
  id: string;
  name: string;
  code: string;
};

type AdminUser = {
  id: string;
  name: string;
  email: string;
  global_role: AppRole | string;
  is_active: boolean | null;
  projectCode: string;
};

type AdminProject = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  memberCount: number;
};

type ProjectMemberRow = {
  id: string;
  role: string;
  profiles: {
    name: string;
    email: string;
  } | null;
};

type CreatedUserCredentials = {
  user_id: string;
  new_user_id: string;
  password: string;
  email: string;
};

type EngineerOption = {
  user_id: string;
  name: string;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "create-user", label: "Create User" },
  { id: "create-project", label: "Create Project" },
  { id: "all-users", label: "All Users" },
  { id: "all-projects", label: "All Projects" },
];

const ROLE_OPTIONS: Array<{ value: AppRole; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "planner", label: "Planner" },
  { value: "site_engineer", label: "Site Engineer" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_BADGE_STYLES: Record<string, string> = {
  admin:
    "bg-zinc-100 text-zinc-700 dark:border dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
  planner:
    "bg-blue-100 text-blue-700 dark:border dark:border-blue-600 dark:bg-blue-600 dark:text-white",
  site_engineer:
    "bg-amber-100 text-amber-800 dark:border dark:border-amber-600 dark:bg-amber-600 dark:text-white",
  viewer:
    "bg-gray-100 text-gray-600 dark:border dark:border-zinc-600 dark:bg-zinc-600 dark:text-white",
};

const STATUS_BADGE_STYLES = {
  active:
    "bg-green-100 text-green-700 dark:border dark:border-emerald-600 dark:bg-emerald-600 dark:text-white",
  inactive:
    "bg-zinc-100 text-zinc-600 dark:border dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const ADMIN_PAGE_BG_CLASS =
  "relative min-h-full w-full bg-gradient-to-br from-[#e8f6f7] via-[#eaf4ff] to-[#f0f9ed] dark:bg-none dark:bg-[#0a1420]";

const ADMIN_CARD_BASE =
  "rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const ADMIN_FLOATING_CARD_CLASS = `${ADMIN_CARD_BASE} border-l-4 border-l-[#359FAB] shadow-black/5`;

const ADMIN_TABLE_CARD_CLASS =
  "overflow-x-auto rounded-xl border border-zinc-200 border-l-4 border-l-[#54B5FB] bg-white shadow-lg shadow-[#54B5FB]/15 dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30";

const ADMIN_FORM_FIELD_CLASS =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900";

const ADMIN_PRIMARY_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#54B5FB] dark:text-white dark:hover:bg-[#3a9ce8]";

function AdminPageShell({
  children,
  contentClassName = "relative mx-auto w-full max-w-7xl flex-1 p-6 sm:p-10",
}: {
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <main className={ADMIN_PAGE_BG_CLASS}>
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

function normalizeProfileRow(row: Record<string, unknown>): AdminUser | null {
  const id = row.id;
  const name = row.name;
  const email = row.email;
  const globalRole = row.global_role;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof globalRole !== "string"
  ) {
    return null;
  }

  const members = row.project_members;
  let projectCode = "—";

  if (Array.isArray(members) && members.length > 0) {
    const first = members[0] as Record<string, unknown>;
    const projects = first.projects;
    const project =
      Array.isArray(projects) && projects.length > 0
        ? (projects[0] as Record<string, unknown>)
        : (projects as Record<string, unknown> | null);

    if (project && typeof project.code === "string") {
      projectCode = project.code;
    }
  }

  return {
    id,
    name,
    email,
    global_role: globalRole,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    projectCode,
  };
}

function normalizeProjectRow(row: Record<string, unknown>): AdminProject | null {
  if (
    typeof row.id !== "string" ||
    typeof row.code !== "string" ||
    typeof row.name !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  const members = row.project_members;
  let memberCount = 0;

  if (Array.isArray(members) && members.length > 0) {
    const countEntry = members[0] as Record<string, unknown>;
    if (typeof countEntry.count === "number") {
      memberCount = countEntry.count;
    }
  }

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    created_at: row.created_at,
    memberCount,
  };
}

function normalizeMemberRow(row: Record<string, unknown>): ProjectMemberRow | null {
  if (typeof row.id !== "string" || typeof row.role !== "string") {
    return null;
  }

  const profiles = row.profiles;
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as Record<string, unknown>)
      : (profiles as Record<string, unknown> | null);

  if (!profile || typeof profile.name !== "string" || typeof profile.email !== "string") {
    return {
      id: row.id,
      role: row.role,
      profiles: null,
    };
  }

  return {
    id: row.id,
    role: row.role,
    profiles: {
      name: profile.name,
      email: profile.email,
    },
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
      className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-700 dark:hover:bg-zinc-50"
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

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabId>("create-user");
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allProjects, setAllProjects] = useState<AdminProject[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<AppRole>("site_engineer");
  const [createProjectId, setCreateProjectId] = useState("");
  const [assignToEngineerId, setAssignToEngineerId] = useState("");
  const [engineerOptions, setEngineerOptions] = useState<EngineerOption[]>([]);
  const [isLoadingEngineers, setIsLoadingEngineers] = useState(false);
  const [createUserWarning, setCreateUserWarning] = useState<string | null>(
    null,
  );
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] =
    useState<CreatedUserCredentials | null>(null);

  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [createProjectSuccess, setCreateProjectSuccess] = useState<string | null>(null);

  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<{
    userName: string;
    newPassword: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectMembers, setProjectMembers] = useState<
    Record<string, ProjectMemberRow[]>
  >({});
  const [loadingMembersProjectId, setLoadingMembersProjectId] = useState<
    string | null
  >(null);

  const loadAdminData = useCallback(async () => {
    setIsLoadingData(true);
    setDataError(null);

    const supabase = createClient();

    const [projectsResult, usersResult, allProjectsResult] = await Promise.all([
      supabase.from("projects").select("id, name, code").order("name"),
      supabase.from("profiles").select(`
          id,
          name,
          email,
          global_role,
          is_active,
          project_members (
            projects (code)
          )
        `),
      supabase.from("projects").select(`
          id,
          code,
          name,
          created_at,
          project_members (count)
        `).order("name"),
    ]);

    if (projectsResult.error || usersResult.error || allProjectsResult.error) {
      setDataError(
        projectsResult.error?.message ??
          usersResult.error?.message ??
          allProjectsResult.error?.message ??
          "Failed to load admin data.",
      );
      setIsLoadingData(false);
      return;
    }

    setProjects((projectsResult.data ?? []) as ProjectOption[]);
    setUsers(
      (usersResult.data ?? [])
        .map((row) => normalizeProfileRow(row as Record<string, unknown>))
        .filter((row): row is AdminUser => row !== null),
    );
    setAllProjects(
      (allProjectsResult.data ?? [])
        .map((row) => normalizeProjectRow(row as Record<string, unknown>))
        .filter((row): row is AdminProject => row !== null),
    );

    if (projectsResult.data && projectsResult.data.length > 0) {
      setCreateProjectId((current) => current || projectsResult.data![0].id);
    }

    setIsLoadingData(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (!user) {
        setIsAdmin(false);
        setIsCheckingAccess(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("global_role")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;

      const admin = profile?.global_role === "admin";
      setIsAdmin(admin);
      setIsCheckingAccess(false);

      if (admin) {
        void loadAdminData();
      }
    }

    void checkAccess();

    return () => {
      isMounted = false;
    };
  }, [loadAdminData]);

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

    const userIds = (members ?? []).map((member) => member.user_id);

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
        user_id: profile.id,
        name: profile.name,
      })),
    );
    setIsLoadingEngineers(false);
  }, []);

  useEffect(() => {
    if (createRole !== "viewer" || !createProjectId) {
      return;
    }

    void loadSiteEngineers(createProjectId);
  }, [createRole, createProjectId, loadSiteEngineers]);

  useEffect(() => {
    if (createRole !== "viewer") {
      setAssignToEngineerId("");
    }
  }, [createRole]);

  useEffect(() => {
    setAssignToEngineerId("");
  }, [createProjectId]);

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateUserError(null);
    setCreatedCredentials(null);
    setCreateUserWarning(null);
    setIsCreatingUser(true);

    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          role: createRole,
          project_id: createProjectId,
        }),
      });

      const payload = (await response.json()) as CreatedUserCredentials & {
        error?: string;
      };

      if (!response.ok) {
        setCreateUserError(payload.error ?? "Failed to create user.");
        return;
      }

      const newUserUuid = payload.new_user_id;

      if (createRole === "viewer" && assignToEngineerId && newUserUuid) {
        const supabase = createClient();
        const { error: assignError } = await supabase
          .from("viewer_assignments")
          .insert({
            viewer_id: newUserUuid,
            engineer_id: assignToEngineerId,
            project_id: createProjectId,
            is_active: true,
          });

        if (assignError) {
          setCreateUserWarning(
            "User created but viewer assignment failed. Please assign manually.",
          );
        }
      }

      setCreatedCredentials({
        user_id: payload.user_id,
        new_user_id: payload.new_user_id,
        password: payload.password,
        email: payload.email,
      });
      setCreateName("");
      setAssignToEngineerId("");
      void loadAdminData();
    } catch {
      setCreateUserError("Failed to create user. Please try again.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleCreateProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateProjectError(null);
    setCreateProjectSuccess(null);
    setIsCreatingProject(true);

    try {
      const response = await fetch("/api/admin/create-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          code: projectCode,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        project?: { code: string };
      };

      if (!response.ok) {
        setCreateProjectError(payload.error ?? "Failed to create project.");
        return;
      }

      setCreateProjectSuccess(
        `Project ${payload.project?.code ?? projectCode.toUpperCase()} created successfully`,
      );
      setProjectName("");
      setProjectCode("");
      void loadAdminData();
    } catch {
      setCreateProjectError("Failed to create project. Please try again.");
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    setActionError(null);
    setDeactivatingUserId(userId);

    try {
      const response = await fetch("/api/admin/deactivate-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setActionError(payload.error ?? "Failed to deactivate user.");
        return;
      }

      setUsers((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, is_active: false } : user,
        ),
      );
      setConfirmDeactivateId(null);
    } catch {
      setActionError("Failed to deactivate user. Please try again.");
    } finally {
      setDeactivatingUserId(null);
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    setActionError(null);
    setResettingUserId(user.id);

    try {
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });

      const payload = (await response.json()) as {
        error?: string;
        new_password?: string;
      };

      if (!response.ok) {
        setActionError(payload.error ?? "Failed to reset password.");
        return;
      }

      if (payload.new_password) {
        setResetPasswordModal({
          userName: user.name,
          newPassword: payload.new_password,
        });
      }
    } catch {
      setActionError("Failed to reset password. Please try again.");
    } finally {
      setResettingUserId(null);
    }
  };

  const loadProjectMembers = async (projectId: string) => {
    if (projectMembers[projectId]) {
      setExpandedProjectId((current) =>
        current === projectId ? null : projectId,
      );
      return;
    }

    setLoadingMembersProjectId(projectId);
    setExpandedProjectId(projectId);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("project_members")
      .select("id, role, profiles (name, email)")
      .eq("project_id", projectId)
      .order("joined_at");

    if (error) {
      setActionError(error.message);
      setLoadingMembersProjectId(null);
      return;
    }

    setProjectMembers((current) => ({
      ...current,
      [projectId]: (data ?? [])
        .map((row) => normalizeMemberRow(row as Record<string, unknown>))
        .filter((row): row is ProjectMemberRow => row !== null),
    }));
    setLoadingMembersProjectId(null);
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  if (isCheckingAccess) {
    return (
      <AdminPageShell contentClassName="relative mx-auto flex min-h-[50vh] w-full max-w-7xl items-center justify-center p-6 sm:p-10">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-label="Loading" />
      </AdminPageShell>
    );
  }

  if (!isAdmin) {
    return (
      <AdminPageShell contentClassName="relative mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
        <div className={`${ADMIN_FLOATING_CARD_CLASS} p-8 text-center`}>
          <ShieldAlert className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-900">
            Access Denied
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-500">
            You do not have permission to access the Admin Panel.
          </p>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          Admin Panel
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Manage users, projects, and credentials
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-zinc-900 text-white dark:bg-zinc-900 dark:text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-white/90 dark:text-zinc-700 dark:ring-zinc-200 dark:hover:bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {dataError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {dataError}
        </p>
      )}

      {actionError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {actionError}
        </p>
      )}

      {activeTab === "create-user" && (
        <section className={`max-w-xl ${ADMIN_FLOATING_CARD_CLASS} p-6`}>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
            Create User
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            Generate a new user ID and password for a project member.
          </p>

          <form onSubmit={handleCreateUser} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="full-name"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Full Name
              </label>
              <input
                id="full-name"
                type="text"
                required
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                disabled={isCreatingUser}
                className={ADMIN_FORM_FIELD_CLASS}
              />
            </div>

            <div>
              <label
                htmlFor="role"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Role
              </label>
              <select
                id="role"
                value={createRole}
                onChange={(event) => setCreateRole(event.target.value as AppRole)}
                disabled={isCreatingUser}
                className={ADMIN_FORM_FIELD_CLASS}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="project"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Project
              </label>
              <select
                id="project"
                required
                value={createProjectId}
                onChange={(event) => setCreateProjectId(event.target.value)}
                disabled={isCreatingUser || projects.length === 0}
                className={ADMIN_FORM_FIELD_CLASS}
              >
                {projects.length === 0 ? (
                  <option value="">No projects available</option>
                ) : (
                  projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.code} — {project.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {createRole === "viewer" && (
              <div>
                <label
                  htmlFor="assign-engineer"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
                >
                  Assign to Site Engineer
                </label>
                <select
                  id="assign-engineer"
                  required
                  value={assignToEngineerId}
                  onChange={(event) =>
                    setAssignToEngineerId(event.target.value)
                  }
                  disabled={
                    isCreatingUser ||
                    isLoadingEngineers ||
                    engineerOptions.length === 0
                  }
                  className={ADMIN_FORM_FIELD_CLASS}
                >
                  <option value="" disabled>
                    {isLoadingEngineers
                      ? "Loading engineers..."
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

            {createUserError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {createUserError}
              </p>
            )}

            <button
              type="submit"
              disabled={
                isCreatingUser ||
                projects.length === 0 ||
                (createRole === "viewer" && !assignToEngineerId)
              }
              className={ADMIN_PRIMARY_BUTTON_CLASS}
            >
              {isCreatingUser && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isCreatingUser ? "Creating..." : "Create User"}
            </button>
          </form>

          {createdCredentials && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30">
              <p className="text-sm font-semibold text-green-900 dark:text-green-200">
                User created successfully
              </p>
              {createUserWarning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  {createUserWarning}
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

      {activeTab === "create-project" && (
        <section className={`max-w-xl ${ADMIN_FLOATING_CARD_CLASS} p-6`}>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
            Create Project
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">
            Add a new project and initialize user ID sequences.
          </p>

          <form onSubmit={handleCreateProject} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="project-name"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Project Name
              </label>
              <input
                id="project-name"
                type="text"
                required
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                disabled={isCreatingProject}
                className={ADMIN_FORM_FIELD_CLASS}
              />
            </div>

            <div>
              <label
                htmlFor="project-code"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-500"
              >
                Project Code
              </label>
              <input
                id="project-code"
                type="text"
                required
                maxLength={6}
                value={projectCode}
                onChange={(event) =>
                  setProjectCode(
                    event.target.value.toUpperCase().replace(/\s/g, ""),
                  )
                }
                disabled={isCreatingProject}
                placeholder="e.g. BSL"
                className={`${ADMIN_FORM_FIELD_CLASS} font-mono uppercase`}
              />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Max 6 characters, no spaces
              </p>
            </div>

            {createProjectError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {createProjectError}
              </p>
            )}

            {createProjectSuccess && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200">
                {createProjectSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={isCreatingProject}
              className={ADMIN_PRIMARY_BUTTON_CLASS}
            >
              {isCreatingProject && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isCreatingProject ? "Creating..." : "Create Project"}
            </button>
          </form>
        </section>
      )}

      {activeTab === "all-users" && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              All Users
            </h2>
            {isLoadingData && (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden="true" />
            )}
          </div>

          <div className={ADMIN_TABLE_CARD_CLASS}>
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    User ID
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Full Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-500"
                    >
                      No users found.
                    </td>
                  </tr>
                ) : (
                  sortedUsers.map((user) => {
                    const isActive = user.is_active !== false;

                    return (
                      <tr key={user.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-900">
                          {user.email.endsWith("@lookahead.app")
                            ? displayUserId(user.email)
                            : user.email.split("@")[0]}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-900">
                          {user.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              ROLE_BADGE_STYLES[user.global_role] ??
                              ROLE_BADGE_STYLES.viewer
                            }`}
                          >
                            {formatRole(user.global_role)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-500">
                          {user.projectCode}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              isActive
                                ? STATUS_BADGE_STYLES.active
                                : STATUS_BADGE_STYLES.inactive
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {confirmDeactivateId === user.id ? (
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-zinc-600 dark:text-zinc-500">
                                  Deactivate this user?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleDeactivateUser(user.id)}
                                  disabled={deactivatingUserId === user.id}
                                  className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeactivateId(null)}
                                  className="rounded-md border border-zinc-300 px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                {isActive && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setConfirmDeactivateId(user.id);
                                      setActionError(null);
                                    }}
                                    disabled={deactivatingUserId === user.id}
                                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                                  >
                                    Deactivate
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void handleResetPassword(user)}
                                  disabled={
                                    !isActive || resettingUserId === user.id
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                                >
                                  {resettingUserId === user.id && (
                                    <Loader2
                                      className="h-3.5 w-3.5 animate-spin"
                                      aria-hidden="true"
                                    />
                                  )}
                                  Reset Password
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "all-projects" && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              All Projects
            </h2>
            {isLoadingData && (
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden="true" />
            )}
          </div>

          <div className={ADMIN_TABLE_CARD_CLASS}>
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Project Code
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Project Name
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-500">
                    Created
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 bg-white">
                {allProjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-500"
                    >
                      No projects found.
                    </td>
                  </tr>
                ) : (
                  allProjects.map((project) => {
                    const isExpanded = expandedProjectId === project.id;
                    const members = projectMembers[project.id] ?? [];

                    return (
                      <tr key={project.id} className="align-top hover:bg-zinc-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-zinc-900 dark:text-zinc-900">
                          {project.code}
                        </td>
                        <td className="px-4 py-3 text-zinc-900 dark:text-zinc-900">
                          {project.name}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                          {project.memberCount}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-500">
                          {formatDate(project.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedProjectId(null);
                                return;
                              }
                              void loadProjectMembers(project.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-200 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-50"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            View Members
                          </button>

                          {isExpanded && (
                            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left dark:border-zinc-200 dark:bg-zinc-50">
                              {loadingMembersProjectId === project.id ? (
                                <div className="flex justify-center py-4">
                                  <Loader2
                                    className="h-5 w-5 animate-spin text-zinc-400"
                                    aria-hidden="true"
                                  />
                                </div>
                              ) : members.length === 0 ? (
                                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                                  No members yet.
                                </p>
                              ) : (
                                <ul className="space-y-2">
                                  {members.map((member) => (
                                    <li
                                      key={member.id}
                                      className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                    >
                                      <div>
                                        <p className="font-medium text-zinc-900 dark:text-zinc-900">
                                          {member.profiles?.name ?? "Unknown"}
                                        </p>
                                        <p className="font-mono text-zinc-500 dark:text-zinc-500">
                                          {member.profiles
                                            ? displayUserId(member.profiles.email)
                                            : "—"}
                                        </p>
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-0.5 font-medium ${
                                          ROLE_BADGE_STYLES[member.role] ??
                                          ROLE_BADGE_STYLES.viewer
                                        }`}
                                      >
                                        {formatRole(member.role)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-200/30 dark:bg-white/95 dark:shadow-xl dark:shadow-black/30">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-900">
              Password reset successfully
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-500">
              New password for {resetPasswordModal.userName}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 dark:border-zinc-200 dark:bg-zinc-50">
              <span className="font-mono text-sm text-zinc-900 dark:text-zinc-900">
                {resetPasswordModal.newPassword}
              </span>
              <CopyButton
                value={resetPasswordModal.newPassword}
                label="New password"
              />
            </div>
            <button
              type="button"
              onClick={() => setResetPasswordModal(null)}
              className={`mt-5 w-full ${ADMIN_PRIMARY_BUTTON_CLASS}`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
