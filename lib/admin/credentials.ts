export const ROLE_CODES = {
  admin: "ADM",
  planner: "PLN",
  site_engineer: "ENG",
  viewer: "VWR",
} as const;

export type AppRole = keyof typeof ROLE_CODES;

export const APP_ROLES: AppRole[] = [
  "admin",
  "planner",
  "site_engineer",
  "viewer",
];

export function isAppRole(value: string): value is AppRole {
  return value in ROLE_CODES;
}

export function padSequence(sequence: number): string {
  return String(sequence).padStart(4, "0");
}

export function formatPasswordRoleCode(roleCode: string): string {
  return roleCode.charAt(0).toUpperCase() + roleCode.slice(1).toLowerCase();
}

export function generateCredentials(
  projectCode: string,
  role: AppRole,
  sequence: number,
) {
  const normalizedCode = projectCode.toUpperCase();
  const roleCode = ROLE_CODES[role];
  const padded = padSequence(sequence);
  const userId = `${normalizedCode}-${roleCode}-${padded}`;
  const password = `${normalizedCode}@${formatPasswordRoleCode(roleCode)}#${padded}`;
  const email = `${userId}@lookahead.app`;

  return { userId, password, email, sequence };
}

export function generatePasswordFromParts(
  projectCode: string,
  roleCode: string,
  sequence: number,
) {
  const normalizedCode = projectCode.toUpperCase();
  const padded = padSequence(sequence);
  return `${normalizedCode}@${formatPasswordRoleCode(roleCode)}#${padded}`;
}

export function parseCredentialsFromEmail(email: string): {
  projectCode: string;
  roleCode: string;
  sequence: number;
} | null {
  const localPart = email.split("@")[0]?.toUpperCase();
  if (!localPart) return null;

  const match = localPart.match(/^(.+)-([A-Z]{3})-(\d{4})$/);
  if (!match) return null;

  return {
    projectCode: match[1],
    roleCode: match[2],
    sequence: Number.parseInt(match[3], 10),
  };
}

export function displayUserId(email: string): string {
  return email.replace(/@lookahead\.app$/i, "");
}
