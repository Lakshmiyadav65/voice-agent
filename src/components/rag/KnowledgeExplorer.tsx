"use client";

import { useState } from "react";
import type { KnowledgeDocument } from "@/lib/database.types";

interface KnowledgeExplorerProps {
  documents: KnowledgeDocument[];
  totalChunks: number;
  aiEmployeeName: string;
  onRefresh: () => void;
}

export function KnowledgeExplorer({
  documents,
  totalChunks,
  aiEmployeeName,
  onRefresh,
}: KnowledgeExplorerProps) {
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [docChunks, setDocChunks] = useState<any[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  function loadChunks(docId: string) {
    setLoadingChunks(true);
    fetch(`/api/rag/chunks?documentId=${docId}`)
      .then((r) => r.json())
      .then((data) => setDocChunks(data.chunks || []))
      .catch(() => setDocChunks([]))
      .finally(() => setLoadingChunks(false));
  }

  function startEditing(doc: KnowledgeDocument) {
    setDraftName(doc.name);
    setDraftText(doc.raw_text);
    setSaveMessage(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!selectedDoc) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/rag/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedDoc.id, name: draftName, text: draftText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save the change.");
      setSelectedDoc(data.document);
      setEditing(false);
      setSaveMessage({ tone: "good", text: "Saved. Your agent uses the new version from its next call." });
      loadChunks(selectedDoc.id);
      onRefresh();
    } catch (err) {
      setSaveMessage({ tone: "bad", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function handleSelectDoc(doc: KnowledgeDocument) {
    setSelectedDoc(doc);
    setEditing(false);
    setSaveMessage(null);
    loadChunks(doc.id);
  }

  async function handleDelete(docId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document and its vector chunks?")) {
      return;
    }

    setDeletingId(docId);
    try {
      const res = await fetch(`/api/rag/documents?id=${docId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onRefresh();
        if (selectedDoc?.id === docId) setSelectedDoc(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">
            Vector Knowledge Base Explorer
          </h3>
          <p className="mt-1 text-xs text-muted">
            Knowledge indexed in Supabase pgvector for <strong className="text-ink">{aiEmployeeName}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-1.5 border border-border text-xs">
            <span className="font-semibold text-accent">{documents.length}</span>
            <span className="text-muted">Documents</span>
            <span className="text-border">|</span>
            <span className="font-semibold text-accent">{totalChunks}</span>
            <span className="text-muted">Vector Chunks (384-dim)</span>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border border-border p-1.5 text-muted hover:bg-background hover:text-ink"
            title="Refresh knowledge list"
          >
            ↻
          </button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background text-2xl">
            🧠
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">No Business Knowledge Indexed Yet</p>
          <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
            Use the <strong>"Explain by Speaking"</strong> tab or <strong>"Upload Documents"</strong> tab above to train {aiEmployeeName} with business facts.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => handleSelectDoc(doc)}
              className={`cursor-pointer rounded-xl border p-4 transition-all hover:border-accent/40 hover:shadow-xs ${
                selectedDoc?.id === doc.id
                  ? "border-accent bg-accent-soft/20 ring-1 ring-accent"
                  : "border-border bg-background/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">
                    {doc.source_type === "voice_transcript" ? "🎙️" : "📄"}
                  </span>
                  <h4 className="text-sm font-semibold text-ink truncate max-w-[200px]">
                    {doc.name}
                  </h4>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    doc.source_type === "voice_transcript"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {doc.source_type === "voice_transcript" ? "Voice Transcript" : "Document"}
                </span>
              </div>

              <p className="mt-2 text-xs text-muted line-clamp-2 leading-relaxed">
                {doc.raw_text}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted">
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700 font-medium">✓ Indexed</span>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(doc.id, e)}
                    disabled={deletingId === doc.id}
                    className="text-red-500 hover:text-red-700 font-medium ml-2"
                  >
                    {deletingId === doc.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected document inspection modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border bg-surface shadow-2xl animate-rise">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">
                  {selectedDoc.source_type === "voice_transcript" ? "🎙️" : "📄"}
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink">{selectedDoc.name}</h3>
                  <p className="text-xs text-muted">
                    Source: {selectedDoc.source_type} • Created:{" "}
                    {new Date(selectedDoc.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="rounded-lg p-1 text-muted hover:bg-background hover:text-ink"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Vector Chunks Section */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Vector Chunks in Database ({loadingChunks ? "Loading..." : `${docChunks.length} Chunks`})
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    384-dim Embeddings
                  </span>
                </div>
                {loadingChunks ? (
                  <div className="p-4 text-center text-xs text-muted">Loading chunks from database...</div>
                ) : docChunks.length === 0 ? (
                  <div className="p-3 text-xs text-muted">No chunks found for this document.</div>
                ) : (
                  <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                    {docChunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="rounded-xl border border-border bg-background p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold text-accent">
                          <span>Chunk #{chunk.chunkIndex}</span>
                          <span className="text-muted font-normal">{chunk.charLength} characters</span>
                        </div>
                        <div className="font-mono text-[11px] text-ink whitespace-pre-wrap leading-relaxed">
                          {chunk.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {editing ? "Edit this item" : `Full Raw Text (${selectedDoc.raw_text.length} chars)`}
                  </span>
                  {!editing ? (
                    <button
                      type="button"
                      onClick={() => startEditing(selectedDoc)}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-ink hover:border-accent"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                {editing ? (
                  <div className="mt-2 space-y-2">
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      aria-label="Title"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
                    />
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      rows={12}
                      aria-label="Text"
                      className="w-full rounded-xl border border-border bg-background p-3 text-sm text-ink outline-hidden focus:border-accent"
                    />
                  </div>
                ) : (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-border bg-background p-4 text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed">
                    {selectedDoc.raw_text}
                  </div>
                )}
                {saveMessage ? (
                  <p className={`mt-2 text-xs ${saveMessage.tone === "good" ? "text-accent" : "text-warn"}`}>
                    {saveMessage.text}
                  </p>
                ) : null}
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Vector Pipeline Details
                </span>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Embedding Model</span>
                    <strong className="text-ink text-xs">all-MiniLM-L6-v2</strong>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Vector Dimensions</span>
                    <strong className="text-ink text-xs">384-dim (Dense)</strong>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-2.5">
                    <span className="text-muted block text-[10px] uppercase">Vector Store</span>
                    <strong className="text-ink text-xs">Supabase pgvector</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border p-4 flex justify-end gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving || !draftName.trim() || !draftText.trim()}
                    className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
