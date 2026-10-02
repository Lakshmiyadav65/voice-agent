import { after, NextResponse } from "next/server";
import { loadAccessibleEmployee } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import { syncBusinessKnowledge } from "@/lib/dograh/knowledge";
import { createAdminClient } from "@/lib/supabase/admin";
import { indexDocument } from "@/lib/rag/index-document";
import { generateDocumentSummary } from "@/lib/rag/qa-engine";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const aiEmployeeId = formData.get("aiEmployeeId") as string | null;
    const customTitle = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!aiEmployeeId) {
      return NextResponse.json({ error: "aiEmployeeId is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // 1. Resolve the employee, refusing ones that belong to another business
    const employee = await loadAccessibleEmployee(supabase, session, aiEmployeeId);
    if (!employee) {
      return NextResponse.json({ error: "AI Employee not found in database" }, { status: 404 });
    }

    const businessId = employee.business_id;

    // 2. Extract text from file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let extractedText = "";

    const fileName = file.name.toLowerCase();
    const fileType = file.type || "application/octet-stream";

    if (fileName.endsWith(".pdf") || fileType.includes("pdf")) {
      try {
        const { extractText } = await import("unpdf");
        const { text } = await extractText(new Uint8Array(buffer));
        extractedText = Array.isArray(text) ? text.join("\n\n") : (text || "");
      } catch (pdfErr: any) {
        console.error("Failed to parse PDF file with unpdf:", pdfErr);
        return NextResponse.json(
          { error: `Could not extract text from PDF (${file.name}): ${pdfErr.message}. Please upload a text-readable PDF or TXT file.` },
          { status: 400 }
        );
      }
    } else {
      // txt, md, csv, json
      extractedText = buffer.toString("utf-8");
    }

    let cleanText = extractedText.replace(/\r\n/g, "\n").trim();
    // Normalize and fix common PDF glyph extraction issues where Rupee symbol ₹ is converted into lowercase 'n' before numbers
    cleanText = cleanText.replace(/\bn(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?)\b/g, "₹$1");

    if (!cleanText || cleanText.length < 5) {
      return NextResponse.json(
        { error: `Could not extract readable text from "${file.name}". The file appears empty or unreadable.` },
        { status: 400 }
      );
    }

    // 3. Generate AI Summary with Groq
    const docTitle = customTitle?.trim() || file.name;
    const aiSummary = await generateDocumentSummary(cleanText, docTitle);

    // 4. Insert into Supabase knowledge_documents
    const { data: doc, error: docError } = await supabase
      .from("knowledge_documents")
      .insert({
        business_id: businessId,
        ai_employee_id: aiEmployeeId,
        name: docTitle,
        source_type: "document_upload",
        file_type: file.type || "text/plain",
        raw_text: cleanText,
        summary: aiSummary,
        status: "indexed",
        metadata: {
          original_filename: file.name,
          file_size_bytes: file.size,
          uploaded_by: session.profile.full_name || session.email,
          uploaded_at: new Date().toISOString(),
        },
      })
      .select("*")
      .single();

    if (docError || !doc) {
      console.error("Supabase knowledge_documents insert error:", docError);
      return NextResponse.json(
        { error: `Database insertion error: ${docError?.message || "Unknown error"}` },
        { status: 500 }
      );
    }

    // 5. Chunk, embed and store in knowledge_chunks
    const chunkIds = await indexDocument(supabase, doc, cleanText, { fileName: file.name });

    // Update document record with confirmed chunk count in metadata
    await supabase
      .from("knowledge_documents")
      .update({
        metadata: {
          ...(doc.metadata || {}),
          chunk_count: chunkIds.length,
        },
      })
      .eq("id", doc.id);

    console.log(`Document "${doc.name}" processed: ${chunkIds.length} chunks stored.`);
    after(() => syncBusinessKnowledge(supabase, businessId));

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      name: doc.name,
      chunksCount: chunkIds.length,
      fileSize: file.size,
      message: `Document "${file.name}" indexed successfully with ${chunkIds.length} vector chunks!`,
    });
  } catch (err: any) {
    console.error("Document upload error:", err);
    return NextResponse.json({ error: err.message || "Failed to process document" }, { status: 500 });
  }
}
