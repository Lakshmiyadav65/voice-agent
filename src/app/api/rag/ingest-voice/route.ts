import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { RecursiveCharacterTextSplitter } from "@/lib/rag/text-splitter";
import { SupabaseVectorStore } from "@/lib/rag/vector-store";
import { generateDocumentSummary } from "@/lib/rag/qa-engine";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      aiEmployeeId,
      businessId: explicitBusinessId,
      businessName,
      transcriptText,
      title = "Spoken Business Overview & Product Details",
      speaker = "Business Owner",
    } = body;

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    if (!transcriptText || !transcriptText.trim()) {
      return NextResponse.json({ error: "Voice transcript text is empty" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // Resolve businessId
    let businessId = explicitBusinessId;
    if (!businessId) {
      const { data: employee } = await supabase
        .from("ai_employees")
        .select("business_id")
        .eq("id", aiEmployeeId)
        .single();
      businessId = employee?.business_id;
    }

    // Validate businessId exists in businesses table
    const { data: validBiz } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .maybeSingle();

    if (!validBiz) {
      const { data: anyBiz } = await supabase
        .from("businesses")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyBiz?.id) {
        businessId = anyBiz.id;
        await supabase
          .from("ai_employees")
          .update({ business_id: businessId })
          .eq("id", aiEmployeeId);
      }
    }

    if (!businessId) {
      return NextResponse.json({ error: "Could not resolve business ID for employee" }, { status: 400 });
    }

    // Update business name if provided
    if (businessName && businessName.trim()) {
      await supabase
        .from("businesses")
        .update({ name: businessName.trim() })
        .eq("id", businessId);
    }

    const trimmedText = transcriptText.trim();
    const docName = title || `Voice Transcript - ${new Date().toLocaleDateString()}`;
    const aiSummary = await generateDocumentSummary(trimmedText, docName);

    // 1. Create record in knowledge_documents
    const { data: dbDoc, error: docError } = await supabase
      .from("knowledge_documents")
      .insert({
        business_id: businessId,
        ai_employee_id: aiEmployeeId,
        name: docName,
        source_type: "voice_transcript",
        file_type: "audio/transcript",
        raw_text: trimmedText,
        summary: aiSummary,
        status: "indexed",
        metadata: {
          speaker,
          recorded_at: new Date().toISOString(),
          recorded_by: session.profile.full_name || session.email,
        },
      })
      .select("*")
      .single();

    if (docError || !dbDoc) {
      console.error("Supabase knowledge_documents insert error:", docError);
      return NextResponse.json(
        { error: `Database error saving voice transcript: ${docError?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    const doc = dbDoc;

    // 2. Intelligent Recursive Splitting
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 450,
      chunkOverlap: 50,
    });

    const chunkDocuments = await splitter.createDocuments([trimmedText], [
      {
        documentId: doc.id,
        businessId,
        aiEmployeeId,
        sourceType: "voice_transcript",
        sourceName: doc.name,
      },
    ]);

    // 3. Supabase Vector Store
    const vectorStore = new SupabaseVectorStore(supabase as any);
    const chunkIds = await vectorStore.addDocuments(chunkDocuments, businessId, aiEmployeeId, doc.id);

    console.log(`Voice transcript indexed: ${chunkDocuments.length} chunks generated, ${chunkIds.length} stored in DB.`);

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      name: doc.name,
      chunksCount: chunkIds.length,
      summary: aiSummary,
    });
  } catch (err: any) {
    console.error("Voice ingest error:", err);
    return NextResponse.json({ error: err.message || "Failed to ingest voice transcript" }, { status: 500 });
  }
}
