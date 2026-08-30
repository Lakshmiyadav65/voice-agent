import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PlaceholderPanel
        title="Dashboard"
        description="Live AI status, today’s calls, leads, WhatsApp sends, appointments, and alerts will appear here. Phase 1 ships the information architecture only."
        notes={[
          "AI Employee status and performance summary",
          "Calls today, qualified leads, WhatsApp sent, appointments",
          "Recent conversations and actionable alerts",
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Calls today", value: "—" },
          { label: "Qualified leads", value: "—" },
          { label: "WhatsApp sent", value: "—" },
          { label: "Appointments", value: "—" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-border bg-surface px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-2xl font-semibold text-ink">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
