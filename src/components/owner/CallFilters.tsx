"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

type CallFiltersProps = {
  sources: Option[];
  campaigns: Option[];
  outcomes: Option[];
  current: { source?: string; campaign?: string; outcome?: string };
};

const FIELDS = [
  { key: "source", label: "Source", all: "All sources" },
  { key: "campaign", label: "Campaign", all: "All campaigns" },
  { key: "outcome", label: "Outcome", all: "All outcomes" },
] as const;

/** Filters live in the URL, so a filtered view can be bookmarked or shared. */
export function CallFilters({ sources, campaigns, outcomes, current }: CallFiltersProps) {
  const router = useRouter();
  const options = { source: sources, campaign: campaigns, outcome: outcomes };
  const filtered = Boolean(current.source || current.campaign || current.outcome);

  function update(key: keyof CallFiltersProps["current"], value: string) {
    const params = new URLSearchParams();
    for (const field of FIELDS) {
      const next = field.key === key ? value : current[field.key];
      if (next) params.set(field.key, next);
    }
    const query = params.toString();
    router.push(query ? `/dashboard/calls?${query}` : "/dashboard/calls", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {FIELDS.map((field) => (
        <label key={field.key} className="block">
          <span className="text-xs font-semibold text-muted">{field.label}</span>
          <select
            value={current[field.key] ?? ""}
            onChange={(e) => update(field.key, e.target.value)}
            className="mt-1 block min-w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
          >
            <option value="">{field.all}</option>
            {options[field.key].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {filtered ? (
        <Link
          href="/dashboard/calls"
          scroll={false}
          className="pb-2 text-sm font-semibold text-accent hover:underline"
        >
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}
