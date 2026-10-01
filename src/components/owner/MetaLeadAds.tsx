"use client";

import { useState } from "react";

export type MetaPageSummary = {
  id: string;
  page_name: string;
  last_lead_at: string | null;
  last_error: string | null;
  created_at: string;
};

type Props = {
  configured: boolean;
  canManage: boolean;
  initialPages: MetaPageSummary[];
  notice: { tone: "good" | "bad"; text: string } | null;
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function MetaLeadAds({ configured, canManage, initialPages, notice }: Props) {
  const [pages, setPages] = useState(initialPages);
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(page: MetaPageSummary) {
    if (!window.confirm(`Stop taking lead ads from ${page.page_name}?`)) return;
    setBusy(page.id);
    try {
      const res = await fetch(`/api/integrations/meta/pages/${page.id}`, { method: "DELETE" });
      if (res.ok) setPages((list) => list.filter((p) => p.id !== page.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "good"
              ? "border-accent/30 bg-accent-soft text-accent"
              : "border-warn/40 bg-warn/5 text-warn"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {pages.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Facebook Page</p>
                <p className="mt-1 text-sm font-medium text-ink">{page.page_name}</p>
                <p className="mt-1 text-xs">
                  {page.last_error ? (
                    <span className="text-warn">✕ {page.last_error}</span>
                  ) : page.last_lead_at ? (
                    <span className="text-accent">✓ Last lead {formatWhen(page.last_lead_at)}</span>
                  ) : (
                    <span className="text-muted">Connected {formatWhen(page.created_at)} · waiting for the first lead</span>
                  )}
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  disabled={busy === page.id}
                  onClick={() => disconnect(page)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-warn hover:text-warn disabled:opacity-50"
                >
                  Disconnect
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-xl border border-border bg-surface p-5">
        {configured ? (
          <>
            <p className="text-sm text-foreground">
              {pages.length
                ? "Add another Page, or reconnect to refresh access."
                : "Connect your Facebook Page. Instagram lead ads run through the same Page, so they are covered too."}
            </p>
            {canManage ? (
              <a
                href="/api/integrations/meta/connect"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#166FE5]"
              >
                {pages.length ? "Connect another Page" : "Connect Facebook Page"}
              </a>
            ) : (
              <p className="mt-3 text-xs text-muted">Only the business owner can connect a Page.</p>
            )}
            <p className="mt-3 text-xs text-muted">
              Facebook asks which Pages to share. Tick the Page your lead ads run from. Leads then
              get a call within seconds, tagged with their campaign and ad name.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            Connecting Facebook isn&apos;t switched on for this platform yet. Until it is, use your
            lead form link from &ldquo;Ad links&rdquo; above as your ad&apos;s website URL; those leads are
            called just the same.
          </p>
        )}
      </div>
    </div>
  );
}
