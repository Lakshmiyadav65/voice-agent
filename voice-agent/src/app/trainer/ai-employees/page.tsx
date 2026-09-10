import { requireTrainerAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AiEmployee, Business } from "@/lib/database.types";
import { AiEmployeeManager } from "@/components/employee/AiEmployeeManager";

export default async function TrainerAiEmployeesPage() {
  await requireTrainerAccess();
  const supabase = (await createClient()) || createAdminClient();

  let business: Business | null = null;
  let employees: AiEmployee[] = [];

  if (supabase) {
    const { data: firstBiz } = await supabase
      .from("businesses")
      .select("*")
      .limit(1)
      .maybeSingle();

    business = firstBiz;

    const { data: empList } = await supabase
      .from("ai_employees")
      .select("*")
      .order("created_at", { ascending: false });

    employees = empList || [];
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">Trainer Console — AI Employees</h1>
            <p className="mt-1 text-xs text-muted">
              Configure and test AI employees with voice transcripts and documents before live deployment.
            </p>
          </div>
          {business && (
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-1.5 border border-border text-xs">
              <span className="text-muted">Active Business:</span>
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
