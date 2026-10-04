import type { PlatformRole } from "@/lib/database.types";

export function isPlatformStaff(role: PlatformRole): boolean {
  return role === "trainer" || role === "admin";
}

export function homePathForRole(role: PlatformRole): "/dashboard" | "/trainer" {
  return isPlatformStaff(role) ? "/trainer" : "/dashboard";
}

export function redirectPathForRole(role: PlatformRole): "/dashboard" | "/trainer" {
  return homePathForRole(role);
}

export function canAccessDashboard(role: PlatformRole): boolean {
  return role === "business_owner";
}

export function canAccessTrainerConsole(role: PlatformRole): boolean {
  return isPlatformStaff(role);
}

/**
 * `next` if it is one of our pages this role may open, else null. Never an outside
 * address: "//host" and "/\host" are rejected, since browsers treat both as hosts.
 */
export function safeReturnPath(next: string | null, role: PlatformRole): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  const allowed = isPlatformStaff(role) ? ["/trainer", "/admin"] : ["/dashboard"];
  return allowed.some((prefix) => next === prefix || next.startsWith(`${prefix}/`)) ? next : null;
}
