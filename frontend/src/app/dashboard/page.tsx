"use client";

import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/auth/require-auth";
import { AIInsightsPanel } from "@/components/chat/ai-insights-panel";
import { ChatInterface } from "@/components/chat/chat-interface";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  listAIEmployees,
  listBusinesses,
  type AIEmployee,
  type Business,
  type TurnResponse,
} from "@/lib/api";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const [business, setBusiness] = useState<Business | null>(null);
  const [aiEmployee, setAIEmployee] = useState<AIEmployee | null>(null);
  const [latestTurn, setLatestTurn] = useState<TurnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const businesses = await listBusinesses();
        const primary = businesses[0] ?? null;
        setBusiness(primary);

        if (primary) {
          const employees = await listAIEmployees(primary.id);
          setAIEmployee(employees[0] ?? null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load business");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Loading your business…
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="flex min-h-full items-center justify-center px-6">
        <Card title="No business found">
          <p className="text-sm text-slate-600">
            {error ?? "Your account is not linked to a business yet."}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <AppShell
      title="Business Dashboard"
      subtitle={business.name}
      nav={[{ href: "/dashboard", label: "Talk to AI" }]}
      sidebar={
        <>
          <OverviewSidebar business={business} aiEmployee={aiEmployee} />
          <AIInsightsPanel turn={latestTurn} />
        </>
      }
    >
      <ChatInterface
        business={business}
        aiEmployee={aiEmployee}
        onTurnComplete={setLatestTurn}
        title="Customer conversation preview"
        description="Try questions your customers ask on calls or WhatsApp. The panel on the right shows which business data the AI used."
      />
    </AppShell>
  );
}

function OverviewSidebar({
  business,
  aiEmployee,
}: {
  business: Business;
  aiEmployee: AIEmployee | null;
}) {
  return (
    <>
      <Card title="Your AI employee">
        {aiEmployee ? (
          <div className="space-y-2 text-sm">
            <p className="text-lg font-semibold text-slate-900">{aiEmployee.name}</p>
            <Badge tone={aiEmployee.status === "active" ? "ok" : "warn"}>
              {aiEmployee.status}
            </Badge>
            {aiEmployee.description ? (
              <p className="leading-6 text-slate-600">{aiEmployee.description}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No AI employee configured yet.</p>
        )}
      </Card>

      <Card title="Business Brain">
        <ul className="space-y-2 text-sm text-slate-700">
          <li>Products, prices, and stock</li>
          <li>Offers and FAQs</li>
          <li>Policy documents</li>
          <li>Appointment and CRM tools</li>
        </ul>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          The AI only states facts retrieved from these sources — it will not invent prices or
          policies.
        </p>
      </Card>

      <Card title="Store details">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-slate-500">Business</dt>
            <dd className="font-medium text-slate-900">{business.name}</dd>
          </div>
          {business.industry ? (
            <div>
              <dt className="text-slate-500">Industry</dt>
              <dd className="font-medium text-slate-900">{business.industry}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-slate-500">Timezone</dt>
            <dd className="font-medium text-slate-900">{business.timezone}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <Badge tone={business.status === "active" ? "ok" : "info"}>{business.status}</Badge>
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}
