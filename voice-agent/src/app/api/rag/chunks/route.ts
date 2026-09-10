import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("documentId");
    const aiEmployeeId = searchParams.get("aiEmployeeId");

    if (!documentId && !aiEmployeeId) {
      return NextResponse.json(
        { error: "Either documentId or aiEmployeeId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    let queryBuilder = supabase
      .from("knowledge_chunks")
      .select("id, document_id, chunk_index, content, metadata, created_at")
      .order("chunk_index", { ascending: true });

    if (documentId) {
      queryBuilder = queryBuilder.eq("document_id", documentId);
    } else if (aiEmployeeId) {
      queryBuilder = queryBuilder.eq("ai_employee_id", aiEmployeeId);
    }

    const { data: chunks, error } = await queryBuilder;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedChunks = (chunks || []).map((c) => ({
      id: c.id,
      documentId: c.document_id,
      chunkIndex: c.chunk_index,
      content: c.content,
      charLength: c.content?.length || 0,
      metadata: c.metadata,
      createdAt: c.created_at,
    }));

    return NextResponse.json({
      success: true,
      totalChunks: formattedChunks.length,
      chunks: formattedChunks,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch vector chunks" },
      { status: 500 }
    );
  }
}
