import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";
import { requireTrainerAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function TrainerPage() {
  const session = await requireTrainerAccess();
  const supabase = await createClient();

  const { count } = supabase
    ? await supabase.from("businesses").select("id", { count: "exact", head: true })
    : { count: null };

  return (
    <PlaceholderPanel
      title="Trainer dashboard"
      description="Platform staff can see all businesses through RLS. Business owners are restricted to their own tenant data."
      notes={[
        `Signed in as ${session.profile.full_name ?? session.email}`,
        `Platform role: ${session.profile.platform_role}`,
        `Businesses visible: ${count ?? 0}`,
        "Test Lab, knowledge gaps, and versioning arrive in later phases.",
      ]}
    />
  );
}
