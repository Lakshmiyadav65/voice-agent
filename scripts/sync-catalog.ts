import { createAdminClient } from "../src/lib/supabase/admin";
import { RecursiveCharacterTextSplitter } from "../src/lib/rag/text-splitter";
import { SupabaseVectorStore } from "../src/lib/rag/vector-store";

async function main() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase unavailable");

  const { data: doc, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("name", "Pavan_Electronics_Product_Catalog")
    .single();

  if (error || !doc) {
    console.error("Doc not found:", error);
    return;
  }

  // Clean raw_text: replace 'n16,999' or 'n1,09,999' with '₹16,999' / '₹1,09,999'
  const cleanedText = doc.raw_text.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1");
  console.log("Cleaned text preview:\n", cleanedText.slice(0, 500));

  // Update document raw_text
  await supabase
    .from("knowledge_documents")
    .update({ raw_text: cleanedText })
    .eq("id", doc.id);

  // Delete old chunks for this document
  await supabase.from("knowledge_chunks").delete().eq("document_id", doc.id);

  // Re-chunk with chunkSize: 1000, overlap: 120
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 120,
  });

  const chunkDocs = await splitter.createDocuments([cleanedText], [
    {
      documentId: doc.id,
      businessId: doc.business_id,
      aiEmployeeId: doc.ai_employee_id,
      sourceType: doc.source_type,
      sourceName: doc.name,
      fileName: doc.metadata?.original_filename || doc.name,
    },
  ]);

  console.log(`Creating ${chunkDocs.length} re-indexed chunks...`);
  const vectorStore = new SupabaseVectorStore(supabase as any);
  const chunkIds = await vectorStore.addDocuments(
    chunkDocs,
    doc.business_id,
    doc.ai_employee_id,
    doc.id
  );

  console.log(`Successfully stored ${chunkIds.length} chunks!`);
}

main().catch(console.error);
