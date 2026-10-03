import { NextResponse } from "next/server";

import { canAccessBusiness, getAccessScope } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import {
  buildKnowledgeView,
  knowledgeViewToText,
  sanitizeKnowledgeView,
  textFingerprint,
} from "@/lib/rag/knowledge-view";
import { replaceDocumentText } from "@/lib/rag/update-document";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_DOCUMENT_CHARS = 200_000;

/**
 * The dashboard view of one knowledge document. Built by the LLM on first open and
 * kept in the document's metadata; an edit changes the text's fingerprint, so the
 * next open rebuilds it. ?rebuild=1 forces a fresh one.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const { data: doc } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", searchParams.get("id") ?? "")
    .maybeSingle();
  const scope = await getAccessScope(supabase, session);
  if (!doc || !canAccessBusiness(scope, doc.business_id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const stored = sanitizeKnowledgeView(doc.metadata?.view);
  if (stored && stored.source === textFingerprint(doc.raw_text) && searchParams.get("rebuild") !== "1") {
    return NextResponse.json({ view: stored });
  }

  const view = await buildKnowledgeView(doc.raw_text, doc.name);
  if (!view) {
    return NextResponse.json({ error: "Could not build the readable view right now. Try again in a minute." }, { status: 503 });
  }
  await supabase
    .from("knowledge_documents")
    .update({ metadata: { ...(doc.metadata || {}), view } })
    .eq("id", doc.id);
  return NextResponse.json({ view });
}

/**
 * Saves an edit made on the dashboard. The edited view is written out as the
 * document's new text (re-chunked, so the next call uses it) and kept as the
 * view, so nothing is rebuilt and the owner sees exactly what they saved.
 */
export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });

  const body = await request.json().catch(() => null);
  const { data: doc } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", String(body?.id ?? ""))
    .maybeSingle();
  const scope = await getAccessScope(supabase, session);
  if (!doc || !canAccessBusiness(scope, doc.business_id)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const edited = sanitizeKnowledgeView({ ...(body?.view ?? {}), source: "", builtAt: "" });
  if (!edited) return NextResponse.json({ error: "Add at least one detail before saving." }, { status: 400 });
  const text = knowledgeViewToText(edited);
  if (text.length > MAX_DOCUMENT_CHARS) {
    return NextResponse.json({ error: "That is too long for one item. Split it into a few." }, { status: 400 });
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : doc.name;

  const updated = await replaceDocumentText(supabase, doc, name, text);
  if (!updated) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });

  const view = { ...edited, source: textFingerprint(text), builtAt: new Date().toISOString() };
  const metadata = { ...(updated.metadata || {}), view };
  await supabase.from("knowledge_documents").update({ metadata }).eq("id", doc.id);
  return NextResponse.json({ view, document: { ...updated, metadata } });
}
