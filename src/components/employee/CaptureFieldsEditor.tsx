"use client";

import { useState } from "react";

import {
  FIELD_TYPE_LABELS,
  keyFromLabel,
  MAX_CAPTURE_FIELDS,
  SUGGESTED_FIELDS,
  type CaptureField,
  type CaptureFieldType,
} from "@/lib/voice/capture-fields";

type Props = {
  aiEmployeeId: string;
  employeeName: string;
  initialFields: CaptureField[];
  onSaved: (fields: CaptureField[]) => void;
};

export function CaptureFieldsEditor({ aiEmployeeId, employeeName, initialFields, onSaved }: Props) {
  const [fields, setFields] = useState<CaptureField[]>(initialFields);
  const [saved, setSaved] = useState<CaptureField[]>(initialFields);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const dirty = JSON.stringify(fields) !== JSON.stringify(saved);
  const full = fields.length >= MAX_CAPTURE_FIELDS;
  const usedKeys = new Set(fields.map((f) => f.key));
  const suggestions = SUGGESTED_FIELDS.filter((s) => !usedKeys.has(s.key));

  function update(index: number, patch: Partial<CaptureField>) {
    setFields((list) =>
      list.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, ...patch };
        // Unsaved fields take their key from the label; saved ones keep theirs so past answers still line up.
        if (patch.label !== undefined && !saved.some((s) => s.key === field.key)) {
          next.key = keyFromLabel(patch.label) || field.key;
        }
        return next;
      })
    );
    setStatus("idle");
  }

  function add(field?: CaptureField) {
    if (full) return;
    setFields((list) => [
      ...list,
      field ?? { key: `field_${list.length + 1}_${Math.random().toString(36).slice(2, 6)}`, label: "", type: "text" },
    ]);
    setStatus("idle");
  }

  function remove(index: number) {
    setFields((list) => list.filter((_, i) => i !== index));
    setStatus("idle");
  }

  async function save() {
    if (fields.some((f) => !f.label.trim())) {
      setError("Give every field a name, or remove the empty ones.");
      return;
    }
    setStatus("saving");
    setError("");
    try {
      const res = await fetch(`/api/ai-employees/${aiEmployeeId}/capture-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setFields(data.fields);
      setSaved(data.fields);
      onSaved(data.fields);
      setStatus("saved");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h3 className="font-display text-xl font-semibold text-ink">
          What should {employeeName} find out?
        </h3>
        <p className="mt-1 text-sm text-muted">
          {employeeName} will ask about these naturally on every call. The answers appear on each lead
          and in your emails, Sheet and webhook. Up to {MAX_CAPTURE_FIELDS}.
        </p>
      </div>

      {fields.length > 0 ? (
        <ul className="space-y-3">
          {fields.map((field, index) => (
            <li
              // Index, not field.key: an unsaved field's key follows its label, and a
              // changing key would remount the row and drop focus on every keystroke.
              key={index}
              className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.4fr_0.8fr_1.6fr_auto] sm:items-center"
            >
              <input
                value={field.label}
                maxLength={60}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="e.g. Budget"
                aria-label="Field name"
                className={input}
              />
              <select
                value={field.type}
                onChange={(e) => update(index, { type: e.target.value as CaptureFieldType })}
                aria-label="Answer type"
                className={input}
              >
                {(Object.keys(FIELD_TYPE_LABELS) as CaptureFieldType[]).map((type) => (
                  <option key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <input
                value={field.hint ?? ""}
                maxLength={160}
                onChange={(e) => update(index, { hint: e.target.value })}
                placeholder="Note for the AI (optional)"
                aria-label="Note for the AI"
                className={input}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                className="justify-self-start rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-warn sm:justify-self-center"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
          Nothing yet. Pick a suggestion below or add your own.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.key}
            type="button"
            disabled={full}
            onClick={() => add(suggestion)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent disabled:opacity-40"
          >
            + {suggestion.label}
          </button>
        ))}
        <button
          type="button"
          disabled={full}
          onClick={() => add()}
          className="rounded-full border border-dashed border-accent px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-40"
        >
          + Custom field
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || status === "saving"}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save"}
        </button>
        {status === "saved" && !dirty ? (
          <span className="text-sm text-accent">Saved. Applies from the next call.</span>
        ) : null}
        {error ? <span className="text-sm text-warn">{error}</span> : null}
      </div>
    </div>
  );
}
