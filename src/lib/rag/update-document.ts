import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, KnowledgeDocument } from "@/lib/database.types";
import { indexDocument } from "@/lib/rag/index-document";
import { generateDocumentSummary } from "@/lib/rag/qa-engine";

/**
 * Saves a knowledge item's new title and text. Changed text gets a fresh summary
 * and is re-chunked for search, so the next call already uses it. Null when the
 * save fails.
 */
export async function replaceDocumentText(
  supabase: SupabaseClient<Database>,
  doc: KnowledgeDocument,
  name: string,
  text: string
): Promise<KnowledgeDocument | null> {
  const textChanged = text !== doc.raw_text;
  const summary = textChanged ? await generateDocumentSummary(text, name) : doc.summary;
  const { data: updated, error } = await supabase
    .from("knowledge_documents")
    .update({ name, raw_text: text, summary })
    .eq("id", doc.id)
    .select("*")
    .single();
  if (error || !updated) return null;
  if (!textChanged) return updated;

  await supabase.from("knowledge_chunks").delete().eq("document_id", doc.id);
  const chunkIds = await indexDocument(supabase, updated, text);
  const metadata = { ...(updated.metadata || {}), chunk_count: chunkIds.length };
  await supabase.from("knowledge_documents").update({ metadata }).eq("id", doc.id);
  return { ...updated, metadata };
}
