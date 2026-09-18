import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupabaseVectorStore } from "@/lib/rag/vector-store";
import { synthesizeLeadResponse } from "@/lib/rag/qa-engine";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { aiEmployeeId, query, topK = 6 } = body;

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // Fetch employee and business info
    const { data: employee } = await supabase
      .from("ai_employees")
      .select("*, businesses(name)")
      .eq("id", aiEmployeeId)
      .single();

    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found" }, { status: 404 });
    }

    const businessName = (employee as any).businesses?.name || "our store";

    // Perform vector search
    const vectorStore = new SupabaseVectorStore(supabase as any);
    const searchResults = await vectorStore.similaritySearch(query.trim(), topK, {
      aiEmployeeId,
      businessId: employee.business_id,
      threshold: 0.1,
    });

    // Synthesize response using ChatGroq & LangChain RAG pipeline
    const { answer, confidence, sources } = await synthesizeLeadResponse({
      query: query.trim(),
      contextChunks: searchResults,
      employee: {
        name: employee.name,
        description: employee.description,
        tone: (employee as any).tone,
        language: (employee as any).language,
      },
      businessName,
    });

    return NextResponse.json({
      answer,
      confidence,
      sources,
      retrievedChunks: searchResults.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
        similarity: chunk.similarity,
        metadata: chunk.metadata,
      })),
      query: query.trim(),
      employeeName: employee.name,
    });
  } catch (err: any) {
    console.error("RAG query error:", err);
    return NextResponse.json({ error: err.message || "Failed to query vector database" }, { status: 500 });
  }
}
