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
