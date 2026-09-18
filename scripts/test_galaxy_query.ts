import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";
import { synthesizeLeadResponse } from "../src/lib/rag/qa-engine";

// Load .env
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: chunks } = await supabase
    .from("knowledge_chunks")
    .select("chunk_index, content")
    .order("chunk_index", { ascending: true });

  console.log("=== ALL CHUNKS IN DB ===");
  chunks?.forEach((c) => {
    console.log(`\n--- CHUNK ${c.chunk_index} ---`);
    console.log(c.content);
  });

  const query = "What is the price of Galaxy A16 5G?";
  console.log(`\n========================================`);
  console.log(`TEST QUERY: "${query}"`);
  console.log(`========================================`);

  const vs = new SupabaseVectorStore(supabase as any);
  const results = await vs.similaritySearch(query, 4);

  console.log(`\nRetrieved ${results.length} chunks:`);
  results.forEach((r, i) => {
    console.log(`\n[Result ${i + 1}] Similarity: ${r.similarity}`);
    console.log(r.content);
  });

  const ans = await synthesizeLeadResponse({
    query,
    contextChunks: results,
    employee: { name: "Ram" },
    businessName: "Pavan Electronics",
  });

  console.log("\n=== SYNTHESIZED ANSWER ===");
  console.log(ans.answer);
  console.log("Confidence:", ans.confidence);
}

main().catch(console.error);
