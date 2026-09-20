import type { AiEmployee, Business } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type OwnerWorkspace = {
  businesses: Business[];
  aiEmployees: AiEmployee[];
  primaryBusiness: Business | null;
};

export async function getOwnerWorkspace(userId: string): Promise<OwnerWorkspace> {
  const supabase = await createClient();
  const empty: OwnerWorkspace = {
    businesses: [],
    aiEmployees: [],
    primaryBusiness: null,
  };

  if (!supabase) return empty;

  const { data: memberships } = await supabase
    .from("business_members")
    .select("businesses(*)")
    .eq("user_id", userId);

  const businesses = (memberships ?? [])
    .flatMap((row) => (row as unknown as { businesses: Business | null }).businesses ?? []);

  const primaryBusiness = businesses[0] ?? null;
  if (!primaryBusiness) return empty;

  const { data: aiEmployees } = await supabase
    .from("ai_employees")
    .select("*")
    .eq("business_id", primaryBusiness.id);

  return {
    businesses,
    aiEmployees: aiEmployees ?? [],
    primaryBusiness,
  };
}

export async function getTrainerOverview() {
  const supabase = await createClient();
  if (!supabase) {
    return { businessCount: 0, aiEmployeeCount: 0, liveCount: 0 };
  }

  const [{ count: businessCount }, { count: aiEmployeeCount }, { count: liveCount }] =
    await Promise.all([
      supabase.from("businesses").select("id", { count: "exact", head: true }),
      supabase.from("ai_employees").select("id", { count: "exact", head: true }),
      supabase
        .from("ai_employees")
        .select("id", { count: "exact", head: true })
        .eq("status", "live"),
    ]);

  return {
    businessCount: businessCount ?? 0,
    aiEmployeeCount: aiEmployeeCount ?? 0,
    liveCount: liveCount ?? 0,
  };
}
