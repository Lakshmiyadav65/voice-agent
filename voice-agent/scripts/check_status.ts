import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(url, key);

async function main() {
  const { data: employees, error: empErr } = await supabase.from("ai_employees").select("*");
  console.log("AI Employees:", employees?.length, empErr?.message ?? "OK");

  const { data: businesses, error: bizErr } = await supabase.from("businesses").select("*");
  console.log("Businesses:", businesses?.length, bizErr?.message ?? "OK");

  // Check if pgvector is enabled / test vector table
  const { data: vectorCheck, error: vecErr } = await supabase.from("knowledge_chunks").select("id").limit(1);
  console.log("knowledge_chunks table exists?", !vecErr, vecErr?.message ?? "Found");
}

main().catch(console.error);
