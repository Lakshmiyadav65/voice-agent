import { createHash } from "node:crypto";

import { getChatGroq } from "./qa-engine";

/**
 * A readable, dashboard-style view of one knowledge document: headline numbers,
 * then sections shown as facts, lists, tables or questions. It is built from the
 * document's text by the LLM and only ever displayed; calls keep using the text
 * itself, so a weak view can never change what the agent says.
 */

export type ViewFact = { label: string; value: string };

export type ViewSection =
  | { kind: "facts"; title: string; items: ViewFact[] }
  | { kind: "list"; title: string; items: string[] }
  | { kind: "table"; title: string; columns: string[]; rows: string[][] }
  | { kind: "faq"; title: string; items: { q: string; a: string }[] }
  | { kind: "text"; title: string; text: string };

export type KnowledgeView = {
  headline: string;
  facts: ViewFact[];
  sections: ViewSection[];
  // Fingerprint of the text the view was built from, so an edit rebuilds it.
  source: string;
  builtAt: string;
};

const MAX_SOURCE_CHARS = 24_000;
const LIMITS = { facts: 8, sections: 24, items: 40, rows: 40, columns: 6, text: 300, long: 1200 };

export function textFingerprint(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

const PROMPT = `You turn a business's knowledge document into a clear dashboard for the business owner.
Use ONLY what the document says. Copy numbers, prices, names, dates and units exactly as written. Never add, guess or round anything.
Keep every important detail: if the document lists prices, plans, timings, charges, offers or rules, they must appear.

Answer with a JSON object: a one-sentence "headline" saying what the document is about, the headline "facts",
and "sections". Every section has all of these fields, but fills only the one that matches its "kind" and leaves the others empty:
- kind "facts": "facts" holds label/value pairs, e.g. { "label": "Phone", "value": "+91 ..." }
- kind "table": "columns" and "rows", e.g. columns ["Type", "Size", "Price"], rows [["2 BHK", "1,240 sq ft", "from Rs 79 lakh"]]
- kind "list": "items" holds short strings
- kind "faq": "faq" holds { "q": "...", "a": "..." } pairs
- kind "text": "text" holds a short paragraph

Rules:
- "facts": 6 to 8 headline numbers or details a customer cares about most, such as location or area, size, how many, starting price and key dates. Always include the location when the document gives one. They describe what is on offer (for a project: area, land size, towers, homes, starting price, possession), never contact details, which go in a section instead. Labels of 1 to 3 words, values under 40 characters.
- Prefer a "facts" section over "text" whenever lines look like "Label: value".
- Inside sections, keep each detail complete, with its conditions and notes ("included with 2 BHK", "most popular", "not on Towers A and B"). Do not shorten or merge details there.
- Every part of the document must land in some section, including questions and any rules or instructions.
- Use a "table" for anything with rows that share columns (price lists, unit types, plans, schedules).
- Use "facts" sections for label/value details (contact, timings, charges, approvals).
- Use "list" for amenities, offers, rules, features, places nearby. Keep each item short.
- Use "faq" for questions and answers.
- Order sections the way the document does. Section titles are short, in plain words.`;

const FACT = {
  type: "object",
  additionalProperties: false,
  required: ["label", "value"],
  properties: { label: { type: "string" }, value: { type: "string" } },
};

/**
 * Strict structured output: Groq constrains decoding to this schema, so the reply always
 * parses. Strict mode needs every field present, hence one section shape for all kinds.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "facts", "sections"],
  properties: {
    headline: { type: "string" },
    facts: { type: "array", items: FACT },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "facts", "items", "columns", "rows", "faq", "text"],
        properties: {
          kind: { type: "string", enum: ["facts", "list", "table", "faq", "text"] },
          title: { type: "string" },
          facts: { type: "array", items: FACT },
          items: { type: "array", items: { type: "string" } },
          columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } },
          faq: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["q", "a"],
              properties: { q: { type: "string" }, a: { type: "string" } },
            },
          },
          text: { type: "string" },
        },
      },
    },
  },
};

/** The model's one-shape section into the stored, kind-specific shape. */
function fromModelSection(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const s = raw as Record<string, unknown>;
  if (s.kind === "facts") return { kind: s.kind, title: s.title, items: s.facts };
  if (s.kind === "faq") return { kind: s.kind, title: s.title, items: s.faq };
  return s;
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : typeof value === "number" ? String(value) : "";
}

function facts(value: unknown, max: number): ViewFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((f) => ({ label: str(f?.label, LIMITS.text), value: str(f?.value, LIMITS.text) }))
    .filter((f) => f.label && f.value)
    .slice(0, max);
}

function section(raw: unknown): ViewSection | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const title = str(s.title, LIMITS.text);
  if (!title) return null;
  switch (s.kind) {
    case "facts": {
      const items = facts(s.items, LIMITS.items);
      return items.length ? { kind: "facts", title, items } : null;
    }
    case "list": {
      const items = (Array.isArray(s.items) ? s.items : []).map((i) => str(i, LIMITS.long)).filter(Boolean).slice(0, LIMITS.items);
      return items.length ? { kind: "list", title, items } : null;
    }
    case "table": {
      const columns = (Array.isArray(s.columns) ? s.columns : []).map((c) => str(c, LIMITS.text)).slice(0, LIMITS.columns);
      const rows = (Array.isArray(s.rows) ? s.rows : [])
        .filter(Array.isArray)
        .map((r) => columns.map((_, i) => str((r as unknown[])[i], LIMITS.text)))
        .filter((r) => r.some(Boolean))
        .slice(0, LIMITS.rows);
      return columns.length && rows.length ? { kind: "table", title, columns, rows } : null;
    }
    case "faq": {
      const items = (Array.isArray(s.items) ? s.items : [])
        .map((i) => ({ q: str(i?.q, LIMITS.long), a: str(i?.a, LIMITS.long) }))
        .filter((i) => i.q && i.a)
        .slice(0, LIMITS.items);
      return items.length ? { kind: "faq", title, items } : null;
    }
    case "text": {
      const text = str(s.text, LIMITS.long);
      return text ? { kind: "text", title, text } : null;
    }
    default:
      return null;
  }
}

/** Reads a stored view, dropping anything malformed; null when there is none. */
export function sanitizeKnowledgeView(value: unknown): KnowledgeView | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map(section)
    .filter((s): s is ViewSection => s !== null)
    .slice(0, LIMITS.sections);
  const view = {
    headline: str(raw.headline, 300),
    facts: facts(raw.facts, LIMITS.facts),
    sections,
    source: str(raw.source, 64),
    builtAt: str(raw.builtAt, 40),
  };
  return view.facts.length || view.sections.length ? view : null;
}

/** Asks the LLM for the view; null when no model is configured or the answer is unusable. */
export async function buildKnowledgeView(text: string, name: string): Promise<KnowledgeView | null> {
  const source = textFingerprint(text);
  const input = `Document name: ${name}\n\n"""\n${text.slice(0, MAX_SOURCE_CHARS)}\n"""`;

  // A view runs to a few thousand output tokens, past the free-tier per-minute output cap of
  // the default GROQ_MODEL, so these models are fixed here; the smaller one is the fallback.
  for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    // Input plus this cap must stay under the free tier's 8,000 tokens a minute; a view needs about 3,000.
    const llm = getChatGroq(undefined, model, 5000);
    if (!llm) return null;
    try {
      const reply = await llm.invoke(
        [
          ["system", PROMPT],
          ["human", input],
        ],
        {
          response_format: {
            type: "json_schema",
            json_schema: { name: "knowledge_view", strict: true, schema: RESPONSE_SCHEMA },
          },
          // Low effort keeps reasoning from eating the output budget.
          reasoning_effort: "low",
        }
      );
      const content = typeof reply.content === "string" ? reply.content : JSON.stringify(reply.content);
      const json = content.match(/\{[\s\S]*\}/);
      if (!json) continue;
      const parsed = JSON.parse(json[0]);
      const sections = Array.isArray(parsed.sections) ? parsed.sections.map(fromModelSection) : [];
      const view = sanitizeKnowledgeView({ ...parsed, sections, source, builtAt: new Date().toISOString() });
      if (view) return view;
    } catch (err) {
      console.warn(`Knowledge view with ${model} failed:`, (err as Error).message);
    }
  }
  return null;
}

/**
 * Writes a view back out as plain text, for when the owner edits the dashboard:
 * this text replaces the document's, so it is what calls read from then on. Table
 * rows become one line each that names every column, so a row still makes sense
 * when search hands the agent a single chunk.
 */
export function knowledgeViewToText(view: Pick<KnowledgeView, "headline" | "facts" | "sections">): string {
  const blocks: string[] = [];
  if (view.headline) blocks.push(view.headline);
  if (view.facts.length) blocks.push(["KEY FACTS", ...view.facts.map((f) => `${f.label}: ${f.value}`)].join("\n"));
  for (const s of view.sections) {
    const heading = s.title.toUpperCase();
    switch (s.kind) {
      case "facts":
        blocks.push([heading, ...s.items.map((f) => `${f.label}: ${f.value}`)].join("\n"));
        break;
      case "list":
        blocks.push([heading, ...s.items.map((item) => `- ${item}`)].join("\n"));
        break;
      case "table":
        blocks.push(
          [
            heading,
            ...s.rows.map((row) =>
              [row[0], ...row.slice(1).map((cell, i) => (cell ? `${s.columns[i + 1] || "Detail"}: ${cell}` : ""))]
                .filter(Boolean)
                .join(" - ")
            ),
          ].join("\n")
        );
        break;
      case "faq":
        blocks.push([heading, ...s.items.map((item) => `Q: ${item.q}\nA: ${item.a}`)].join("\n"));
        break;
      case "text":
        blocks.push(`${heading}\n${s.text}`);
        break;
    }
  }
  return blocks.join("\n\n");
}
