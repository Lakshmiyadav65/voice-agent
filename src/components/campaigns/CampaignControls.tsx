"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/ui/ConfirmDialog";
import type { Campaign } from "@/lib/database.types";

const ACTIONS: Record<Campaign["status"], Array<{ action: "start" | "pause" | "resume"; label: string; primary?: boolean }>> = {
  draft: [{ action: "start", label: "Start calling", primary: true }],
  running: [{ action: "pause", label: "Pause" }],
  paused: [{ action: "resume", label: "Resume", primary: true }],
  completed: [],
};

export function CampaignControls({ campaign, contacts }: { campaign: Campaign; contacts: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startMessage(): string {
    const hours = `${campaign.window_start.slice(0, 5)}–${campaign.window_end.slice(0, 5)} IST`;
    const wait = campaign.retry_after_minutes >= 1440 ? "the next day" : `${campaign.retry_after_minutes} min later`;
    const retry = campaign.max_attempts > 1 ? ` Anyone who doesn’t answer is called again ${wait}.` : "";
    return `Calls go out between ${hours}, up to ${campaign.max_concurrent} at a time.${retry} You can pause at any time.`;
  }

  async function run(action: string) {
    if (
      action === "start" &&
      !(await confirm({
        title: `Start calling ${contacts} ${contacts === 1 ? "contact" : "contacts"}?`,
        message: startMessage(),
        confirmLabel: "Start calling",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const confirmed = await confirm({
      title: "Delete this campaign?",
      message: "The leads and call history it created are kept.",
      confirmLabel: "Delete campaign",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/campaigns");
    else setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS[campaign.status].map(({ action, label, primary }) => (
        <button
          key={action}
          type="button"
          disabled={busy}
          onClick={() => run(action)}
          className={
            primary
              ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
              : "rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent disabled:opacity-50"
          }
        >
          {label}
        </button>
      ))}
      {campaign.status !== "running" ? (
        <button type="button" disabled={busy} onClick={remove} className="px-2 text-sm font-semibold text-muted hover:text-warn disabled:opacity-50">
          Delete
        </button>
      ) : null}
      {error ? <span className="text-sm text-warn">{error}</span> : null}
    </div>
  );
}

export function NeverCallButton({ phone }: { phone: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function block() {
    const confirmed = await confirm({
      title: `Never call ${phone} again?`,
      message: "This number is skipped in this campaign and every future one. A call that is already ringing finishes.",
      confirmLabel: "Never call",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    await fetch("/api/do-not-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, reason: "Blocked from campaign" }),
    });
    router.refresh();
  }

  return (
    <button type="button" disabled={busy} onClick={block} className="text-xs font-semibold text-muted hover:text-warn disabled:opacity-50">
      Never call
    </button>
  );
}
