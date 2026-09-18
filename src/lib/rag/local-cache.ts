import fs from "fs";
import path from "path";
import type { KnowledgeDocument, KnowledgeChunk } from "@/lib/database.types";

const CACHE_DIR = path.join(process.cwd(), ".rag_cache");
const CACHE_FILE = path.join(CACHE_DIR, "knowledge_store.json");

interface LocalStore {
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
}

function ensureStore(): LocalStore {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (!fs.existsSync(CACHE_FILE)) {
      const initial: LocalStore = { documents: [], chunks: [] };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(initial, null, 2), "utf-8");
      return initial;
    }
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Local RAG store initialization notice:", err);
    return { documents: [], chunks: [] };
  }
}

function saveStore(store: LocalStore) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write to local RAG store:", err);
  }
}

export const localRagStore = {
  getDocuments(aiEmployeeId?: string): KnowledgeDocument[] {
    const store = ensureStore();
    if (!aiEmployeeId) return store.documents;
    return store.documents.filter((d) => d.ai_employee_id === aiEmployeeId);
  },

  addDocument(doc: KnowledgeDocument): void {
    const store = ensureStore();
    store.documents = [doc, ...store.documents.filter((d) => d.id !== doc.id)];
    saveStore(store);
  },

  deleteDocument(documentId: string): void {
    const store = ensureStore();
    store.documents = store.documents.filter((d) => d.id !== documentId);
    store.chunks = store.chunks.filter((c) => c.document_id !== documentId);
    saveStore(store);
  },

  getChunks(aiEmployeeId?: string): KnowledgeChunk[] {
    const store = ensureStore();
    if (!aiEmployeeId) return store.chunks;
    return store.chunks.filter((c) => c.ai_employee_id === aiEmployeeId);
  },

  addChunks(chunks: KnowledgeChunk[]): void {
    const store = ensureStore();
    store.chunks = [...store.chunks, ...chunks];
    saveStore(store);
  },
};
