"use client";

import { useEffect, useState } from "react";

import { RequireAuth } from "@/components/auth/require-auth";
import { AIInsightsPanel } from "@/components/chat/ai-insights-panel";
import { ChatInterface } from "@/components/chat/chat-interface";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  listAIEmployees,
  listBusinesses,
  previewRouting,
  type AIEmployee,
  type Business,
  type TurnResponse,
} from "@/lib/api";

const ROUTING_EXAMPLES = [
  "What is the iPhone 15 price?",
  "What is your return policy?",
  "Book appointment tomorrow 4 PM",
  "Send details on WhatsApp",
];

export default function TrainerPage() {
  return (
    <RequireAuth internalOnly>
      <TrainerContent />
    </RequireAuth>
  );
}

function TrainerContent() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [aiEmployee, setAIEmployee] = useState<AIEmployee | null>(null);
  const [latestTurn, setLatestTurn] = useState<TurnResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const business = businesses.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    listBusinesses()
      .then((items) => {
        setBusinesses(items);
        if (items[0]) {
          setSelectedId(items[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    listAIEmployees(selectedId).then((employees) => {
      setAIEmployee(employees[0] ?? null);
    });
  }, [selectedId]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Loading trainer console…
      </div>
    );
  }

  return (
    <AppShell
      title="Trainer Console"
      subtitle="Test Lab"
      nav={[{ href: "/trainer", label: "Test Lab" }]}
      sidebar={
        business ? (
          <>
            <RoutingPreviewPanel businessId={business.id} />
            <AIInsightsPanel turn={latestTurn} showTechnical />
          </>
        ) : null
      }
    >
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700" htmlFor="business-select">
          Business under test
        </label>
        <select
          id="business-select"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setLatestTurn(null);
          }}
          className="mt-2 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {businesses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {business ? (
        <ChatInterface
          key={selectedId}
          business={business}
          aiEmployee={aiEmployee}
          onTurnComplete={setLatestTurn}
          title="Test Lab conversation"
          description="Run customer utterances against the live conversation engine. Inspect routing, grounding, tool calls, and guardrail blocks before deploying a new AI version."
        />
      ) : (
        <Card title="No businesses available">
          <p className="text-sm text-slate-600">Create or seed a business to start testing.</p>
        </Card>
      )}
    </AppShell>
  );
}

function RoutingPreviewPanel({ businessId }: { businessId: string }) {
  const [routeText, setRouteText] = useState(ROUTING_EXAMPLES[0]);
  const [routePreview, setRoutePreview] = useState<{
    intent: string;
    source: string;
    tools: string[];
    reason: string;
    confidence: number;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  async function runPreview(text: string) {
    setRouteLoading(true);
    try {
      const result = await previewRouting(businessId, text);
      setRoutePreview(result);
    } finally {
      setRouteLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      setRouteLoading(true);
      try {
        const result = await previewRouting(businessId, ROUTING_EXAMPLES[0]);
        if (!cancelled) {
          setRoutePreview(result);
          setRouteText(ROUTING_EXAMPLES[0]);
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  return (
    <>
      <Card title="Routing preview">
        <p className="mb-3 text-sm text-slate-600">
          Preview where a customer question would be routed before running a full turn.
        </p>

        <div className="mb-3 flex flex-wrap gap-2">
          {ROUTING_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setRouteText(example);
                runPreview(example);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            >
              {example}
            </button>
          ))}
        </div>

        <textarea
          value={routeText}
          onChange={(event) => setRouteText(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => runPreview(routeText)}
          disabled={routeLoading || !routeText.trim()}
        >
          {routeLoading ? "Analyzing…" : "Preview route"}
        </Button>

        {routePreview ? (
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Intent</dt>
              <dd className="font-medium capitalize text-slate-900">
                {routePreview.intent.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Source</dt>
              <dd className="font-medium capitalize text-slate-900">
                {routePreview.source.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Confidence</dt>
              <dd>
                <Badge tone="info">{Math.round(routePreview.confidence * 100)}%</Badge>
              </dd>
            </div>
            {routePreview.tools.length > 0 ? (
              <div>
                <dt className="text-slate-500">Tools</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {routePreview.tools.map((tool) => (
                    <Badge key={tool}>{tool.replaceAll("_", " ")}</Badge>
                  ))}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Reason</dt>
              <dd className="leading-6 text-slate-700">{routePreview.reason}</dd>
            </div>
          </dl>
        ) : null}
      </Card>

      <Card title="What trainers verify">
        <ul className="space-y-2 text-sm leading-6 text-slate-700">
          <li>Product questions route to structured catalogue</li>
          <li>Policy questions route to knowledge base</li>
          <li>Appointment requests trigger calendar tools</li>
          <li>Ungrounded prices are blocked by guardrails</li>
        </ul>
      </Card>
    </>
  );
}
