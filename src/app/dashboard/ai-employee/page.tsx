import { requireDashboardAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiEmployee, Business } from "@/lib/database.types";
import { AiEmployeeManager } from "@/components/employee/AiEmployeeManager";

export default async function AiEmployeePage() {
  const session = await requireDashboardAccess();
  const supabase = (await createClient()) || createAdminClient();

  let business: Business | null = null;
  let employees: AiEmployee[] = [];

  if (supabase) {
    // 1. Get user's business membership
    const { data: membership } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", session.userId)
      .limit(1)
      .maybeSingle();

    let businessId = membership?.business_id;

    // Fallback for platform admins/trainers without direct membership: fetch first active business
    if (!businessId) {
      const { data: firstBiz } = await supabase
        .from("businesses")
        .select("*")
        .limit(1)
        .maybeSingle();
      business = firstBiz;
      businessId = firstBiz?.id;
    } else {
      const { data: bizData } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", businessId)
        .maybeSingle();
      business = bizData;
    }

    if (businessId) {
      // 2. Fetch AI employees for this business
      const { data: empList } = await supabase
        .from("ai_employees")
        .select("*")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });

      employees = empList || [];
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">AI Employee Hub</h1>
            <p className="mt-1 text-xs text-muted">
              Create and train voice agents to speak with leads using spoken onboarding and business documents.
            </p>
          </div>
          {business && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 border border-border text-xs">
              <span className="text-muted">Business:</span>
              <strong className="text-ink font-semibold">{business.name}</strong>
            </div>
          )}
        </div>
      </div>

      <AiEmployeeManager
        initialEmployees={employees}
        business={business}
      />
    </div>
  );
}
