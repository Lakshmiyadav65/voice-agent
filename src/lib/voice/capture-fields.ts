/**
 * What an owner wants each call to find out. Shared by the editor, the API,
 * the call dispatcher (to brief the agent) and the analysis (to extract answers).
 */

export type CaptureFieldType = "text" | "number" | "yes_no" | "date";

export type CaptureField = {
  key: string;
  label: string;
  type: CaptureFieldType;
  hint?: string;
};

export type CapturedValue = {
  key: string;
  label: string;
  value: string | number | boolean | null;
};

export const MAX_CAPTURE_FIELDS = 8;
const MAX_LABEL = 60;
const MAX_HINT = 160;

export const FIELD_TYPE_LABELS: Record<CaptureFieldType, string> = {
  text: "Text",
  number: "Number",
  yes_no: "Yes / No",
  date: "Date / time",
};

/** Common asks, offered as one-click additions in the editor. */
export const SUGGESTED_FIELDS: CaptureField[] = [
  { key: "budget", label: "Budget", type: "text", hint: "Price range they mentioned" },
  { key: "product", label: "Product interested in", type: "text" },
  { key: "area", label: "Area / location", type: "text" },
  { key: "buying_timeline", label: "When they plan to buy", type: "text" },
  { key: "exchange_device", label: "Has a phone to exchange", type: "yes_no" },
  { key: "callback_time", label: "Best time to call back", type: "date" },
];

function isFieldType(value: unknown): value is CaptureFieldType {
  return value === "text" || value === "number" || value === "yes_no" || value === "date";
}

export function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Drops anything malformed and de-duplicates keys, so stored JSON is always usable. */
export function sanitizeCaptureFields(value: unknown): CaptureField[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const fields: CaptureField[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, MAX_LABEL) : "";
    const key = keyFromLabel(typeof raw.key === "string" && raw.key ? raw.key : label);
    if (!label || !key || seen.has(key)) continue;

    const hint = typeof raw.hint === "string" ? raw.hint.trim().slice(0, MAX_HINT) : "";
    fields.push({ key, label, type: isFieldType(raw.type) ? raw.type : "text", ...(hint ? { hint } : {}) });
    seen.add(key);
    if (fields.length === MAX_CAPTURE_FIELDS) break;
  }

  return fields;
}

export function sanitizeCaptured(value: unknown): CapturedValue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is CapturedValue =>
      Boolean(item) && typeof item.key === "string" && typeof item.label === "string"
  );
}

export function formatCapturedValue(item: CapturedValue): string | null {
  if (item.value === null || item.value === "") return null;
  if (typeof item.value === "boolean") return item.value ? "Yes" : "No";
  if (typeof item.value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item.value)) {
    const date = new Date(item.value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
    }
  }
  return String(item.value);
}

/** Appended to the agent's briefing so it asks for these naturally during the call. */
export function captureBriefing(fields: CaptureField[]): string {
  if (!fields.length) return "";
  const lines = fields.map((f) => `- ${f.label}${f.hint ? ` (${f.hint})` : ""}`);
  return [
    "INFORMATION TO COLLECT ON THIS CALL:",
    "During the conversation, naturally find out the following. Ask one thing at a time,",
    "only when it fits the conversation, and never insist if the customer does not want to say:",
    ...lines,
  ].join("\n");
}
