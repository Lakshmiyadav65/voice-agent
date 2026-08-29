"use client";

import { type TurnResponse } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function AIInsightsPanel({
  turn,
  showTechnical = false,
}: {
  turn: TurnResponse | null;
  showTechnical?: boolean;
}) {
  if (!turn) {
    return (
      <Card title="How the AI works">
        <p className="text-sm leading-6 text-slate-600">
          Send a message to see how the AI routes your question, which business data it uses, and
          whether guardrails blocked anything unverified.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title="Answer path">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Intent</dt>
            <dd className="mt-1 font-medium capitalize text-slate-900">
              {formatLabel(turn.routing.intent)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Data source</dt>
            <dd className="mt-1 font-medium capitalize text-slate-900">
              {formatLabel(turn.routing.source)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Why</dt>
            <dd className="mt-1 leading-6 text-slate-700">{turn.routing.reason}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Verified facts used">
        {turn.grounding.product_names.length ||
        turn.grounding.prices.length ||
        turn.grounding.passage_count ? (
          <ul className="space-y-2 text-sm text-slate-700">
            {turn.grounding.product_names.map((name) => (
              <li key={name}>Product: {name}</li>
            ))}
            {turn.grounding.prices.map((price) => (
              <li key={price}>Price: ₹{Number(price).toLocaleString("en-IN")}</li>
            ))}
            {turn.grounding.quantities.map((qty) => (
              <li key={qty}>Stock quantity: {qty}</li>
            ))}
            {turn.grounding.passage_count > 0 ? (
              <li>{turn.grounding.passage_count} knowledge-base passage(s)</li>
            ) : null}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">No structured facts were attached to this reply.</p>
        )}
      </Card>

      {turn.knowledge_sources.length > 0 ? (
        <Card title="Documents referenced">
          <ul className="space-y-2 text-sm">
            {turn.knowledge_sources.map((source) => (
              <li key={`${source.document_id}-${source.chunk_index}`} className="text-slate-700">
                <span className="font-medium">{source.document_name}</span>
                <span className="text-slate-500"> · chunk {source.chunk_index + 1}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {turn.tool_calls.length > 0 ? (
        <Card title="Actions taken">
          <ul className="space-y-3 text-sm">
            {turn.tool_calls.map((call, index) => (
              <li key={`${call.tool}-${index}`} className="rounded-lg bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize text-slate-900">
                    {formatLabel(call.tool)}
                  </span>
                  <Badge tone={call.status === "success" ? "ok" : "warn"}>{call.status}</Badge>
                </div>
                {call.message ? <p className="mt-1 text-slate-600">{call.message}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {turn.blocked || turn.escalated || turn.violations.length > 0 ? (
        <Card title="Safety checks">
          <div className="space-y-2">
            {turn.blocked ? <Badge tone="warn">Reply blocked — unverified claim</Badge> : null}
            {turn.escalated ? <Badge tone="danger">Escalated to human</Badge> : null}
            {turn.violations.map((violation) => (
              <p key={violation.detail} className="text-sm text-amber-800">
                {violation.kind}: {violation.detail}
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      {showTechnical ? (
        <Card title="Trainer details">
          <dl className="space-y-2 text-xs text-slate-600">
            <div>
              <dt>Language</dt>
              <dd className="font-medium text-slate-800">{turn.language}</dd>
            </div>
            <div>
              <dt>Conversation state</dt>
              <dd className="font-medium text-slate-800">{turn.state}</dd>
            </div>
            {turn.product_found !== null ? (
              <div>
                <dt>Product found in catalogue</dt>
                <dd className="font-medium text-slate-800">{String(turn.product_found)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
    </>
  );
}
