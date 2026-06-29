export const ROLE_ACCESS = {
  import: ["admin", "planner"],
  planning: ["admin", "planner"],
  constraints: ["admin", "planner", "site_engineer"],
  admin_panel: ["admin"],
  lookahead: ["admin", "planner", "site_engineer", "viewer"],
  activities: ["admin", "planner", "site_engineer", "viewer"],
  dashboard: ["admin", "planner", "site_engineer", "viewer"],
  team: ["admin", "planner"],
} as const;

export type RoleAccessKey = keyof typeof ROLE_ACCESS;

export function hasRoleAccess(
  role: string | null,
  feature: RoleAccessKey,
): boolean {
  if (!role) {
    return false;
  }

  return (ROLE_ACCESS[feature] as readonly string[]).includes(role);
}
