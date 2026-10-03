"use client";

import { useEffect, useState } from "react";

import type { KnowledgeView, ViewSection } from "@/lib/rag/knowledge-view";

import { KnowledgeViewEditor } from "./KnowledgeViewEditor";

type Props = {
  documentId: string;
  name: string;
  rawText: string;
  // Controlled by the list, so its Edit button can open this straight into editing.
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  // After a save, so the list picks up the new title and text.
  onSaved: () => void;
  onEditText: () => void;
};

// Static class names, so Tailwind keeps them: 5 or 6 headline cards sit as two rows of 3, not 4 + 2.
const FACT_COLUMNS = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"];
function factColumns(count: number): string {
  return FACT_COLUMNS[count <= 4 ? count : count <= 6 ? 3 : 4];
}

function isWide(s: ViewSection): boolean {
  return s.kind === "table" || s.kind === "faq" || (s.kind === "list" && s.items.length > 8);
}

/**
 * Which sections span both columns. Wide ones always do; a half-width card also does
 * when nothing could sit beside it (a wide card or the end comes next), so the
 * two-column grid never leaves a hole while keeping the document's order.
 */
function sectionSpans(sections: ViewSection[]): boolean[] {
  const spans: boolean[] = [];
  let rightSlotFree = false;
  sections.forEach((s, i) => {
    if (isWide(s)) {
      spans.push(true);
      rightSlotFree = false;
    } else if (rightSlotFree) {
      spans.push(false);
      rightSlotFree = false;
    } else {
      const next = sections[i + 1];
      const alone = !next || isWide(next);
      spans.push(alone);
      rightSlotFree = !alone;
    }
  });
  return spans;
}

async function fetchView(documentId: string, rebuild = false): Promise<KnowledgeView> {
  const res = await fetch(`/api/rag/documents/view?id=${documentId}${rebuild ? "&rebuild=1" : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.view) throw new Error(data.error ?? "Could not build the readable view.");
  return data.view;
}

/**
 * One knowledge document as a dashboard: headline numbers on top, then each part
 * of the document as facts, a table, a list or questions. The original text stays
 * one click away, and is what calls actually use.
 */
export function KnowledgeDocumentView({
  documentId,
  name,
  rawText,
  editing,
  onEditingChange,
  onSaved,
  onEditText,
}: Props) {
  const [view, setView] = useState<KnowledgeView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchView(documentId).then(
      (v) => {
        if (cancelled) return;
        setView(v);
        setBusy(false);
      },
      (err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setBusy(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function rebuild() {
    setBusy(true);
    setError("");
    try {
      setView(await fetchView(documentId, true));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // With no view to show, the original text opens by default.
  const textVisible = showText !== Boolean(!view && error);
  const spans = view ? sectionSpans(view.sections) : [];

  if (busy && !view) {
    return (
      <div className="space-y-3" aria-busy="true">
        <p className="text-xs text-muted">Reading the document and laying it out…</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-background" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-background" />
      </div>
    );
  }

  if (editing && view) {
    return (
      <KnowledgeViewEditor
        documentId={documentId}
        name={name}
        view={view}
        onSaved={(saved) => {
          setView(saved);
          onEditingChange(false);
          onSaved();
        }}
        onCancel={() => onEditingChange(false)}
        onEditText={onEditText}
      />
    );
  }

  return (
    <div className="space-y-5">
      {view ? (
        <>
          {view.headline ? <p className="text-sm text-foreground">{view.headline}</p> : null}

          {view.facts.length ? (
            <div className={`grid grid-cols-2 gap-3 ${factColumns(view.facts.length)}`}>
              {view.facts.map((f, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface p-3 shadow-xs">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{f.label}</p>
                  <p className="mt-1 break-words text-base font-semibold leading-snug text-ink">{f.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {view.sections.map((s, i) => (
              <SectionCard key={`${i}-${s.title}`} section={s} wide={spans[i]} />
            ))}
          </div>
        </>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-border bg-background p-3 text-xs text-warn">
          {error} The original text is below.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {view ? (
          <button
            type="button"
            onClick={() => onEditingChange(true)}
            className="rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent/90"
          >
            Edit
          </button>
        ) : (
          <button
            type="button"
            onClick={onEditText}
            className="rounded-lg bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:bg-accent/90"
          >
            Edit as plain text
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent"
        >
          {textVisible ? "Hide original text" : "Show original text"}
        </button>
        <button
          type="button"
          onClick={rebuild}
          disabled={busy}
          className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent disabled:opacity-50"
        >
          {busy ? "Rebuilding…" : "Rebuild this view"}
        </button>
        <span className="text-[11px] text-muted">The agent reads the original text on every call.</span>
      </div>

      {textVisible ? (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink">
          {rawText}
        </pre>
      ) : null}
    </div>
  );
}

function SectionCard({ section: s, wide }: { section: ViewSection; wide: boolean }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 shadow-xs ${wide ? "md:col-span-2" : ""}`}>
      <h5 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="h-4 w-1 rounded-full bg-accent" aria-hidden="true" />
        {s.title}
      </h5>
      <SectionBody section={s} wide={wide} />
    </section>
  );
}

function SectionBody({ section: s, wide }: { section: ViewSection; wide: boolean }) {
  switch (s.kind) {
    case "facts":
      return (
        <dl className="divide-y divide-border text-sm">
          {s.items.map((f, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
              <dt className="text-muted">{f.label}</dt>
              <dd className="text-right font-medium text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "list": {
      // Short items read best as tags; longer ones as a list.
      const short = s.items.every((item) => item.length <= 40);
      return short ? (
        <ul className="flex flex-wrap gap-2">
          {s.items.map((item, i) => (
            <li key={i} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-ink">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={`grid gap-2 text-sm text-foreground ${wide && s.items.length > 3 ? "sm:grid-cols-2" : ""}`}>
          {s.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {s.columns.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0 even:bg-background">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-2 align-top ${j === 0 ? "font-medium text-ink" : "text-foreground"}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "faq":
      return (
        <div className="divide-y divide-border">
          {s.items.map((item, i) => (
            <details key={i} className="group py-2">
              <summary className="cursor-pointer list-none text-sm font-medium text-ink marker:hidden">
                <span className="mr-2 inline-block text-accent transition group-open:rotate-90">›</span>
                {item.q}
              </summary>
              <p className="mt-1.5 pl-5 text-sm text-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      );
    case "text":
      return <p className="text-sm leading-relaxed text-foreground">{s.text}</p>;
  }
}
