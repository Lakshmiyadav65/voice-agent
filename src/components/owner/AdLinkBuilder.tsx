"use client";

import { useState } from "react";

const PLATFORMS = [
  { value: "facebook", label: "Facebook", medium: "paid" },
  { value: "instagram", label: "Instagram", medium: "paid" },
  { value: "google", label: "Google", medium: "paid" },
  { value: "whatsapp", label: "WhatsApp", medium: "message" },
  { value: "website", label: "Website / other", medium: "referral" },
] as const;

// Meta fills these in per ad at click time, so one link covers every campaign.
const META_DYNAMIC = "utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

type Platform = (typeof PLATFORMS)[number]["value"];

export function AdLinkBuilder({ formUrl }: { formUrl: string }) {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);

  const selected = PLATFORMS.find((p) => p.value === platform)!;
  const isMeta = platform === "facebook" || platform === "instagram";
  const params = new URLSearchParams({ utm_source: platform, utm_medium: selected.medium });
  if (campaign.trim()) params.set("utm_campaign", campaign.trim());

  // Meta's {{...}} placeholders must stay unencoded or Meta will not substitute them.
  const query = !campaign.trim() && isMeta ? `${params}&${META_DYNAMIC}` : params.toString();
  const link = `${formUrl}?${query}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-ink">Where will the ad run?</span>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-ink">
            Campaign name {isMeta ? <span className="font-normal text-muted">(optional)</span> : null}
          </span>
          <input
            type="text"
            value={campaign}
            maxLength={100}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="e.g. Diwali offer"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-ink outline-hidden focus:border-accent"
          />
        </label>
      </div>

      <p className="mt-3 text-xs text-muted">
        {isMeta && !campaign.trim()
          ? "Left blank, Facebook and Instagram fill in each campaign and ad name for you, so this one link works for all your Meta ads."
          : "Use a different campaign name for each ad so you can compare them on the Leads page."}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <code className="flex-1 break-all rounded-lg bg-background px-3 py-2.5 text-xs text-ink">
          {link}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <p className="mt-4 text-xs text-muted">
        Paste this as the website / destination URL of your ad. Every lead from it is tagged with
        its source and campaign on your Leads page.
      </p>
    </div>
  );
}
