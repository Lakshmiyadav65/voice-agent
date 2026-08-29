"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  endConversation,
  getConversation,
  sendTurn,
  startConversation,
  type AIEmployee,
  type Business,
  type TurnResponse,
  type TurnView,
} from "@/lib/api";

const STARTER_PROMPTS = [
  "What is the iPhone 15 price?",
  "Do you offer EMI?",
  "Where is your store located?",
  "Book appointment tomorrow 4 PM",
];

type ChatInterfaceProps = {
  business: Business;
  aiEmployee: AIEmployee | null;
  title?: string;
  description?: string;
  onTurnComplete?: (turn: TurnResponse) => void;
};

export function ChatInterface({
  business,
  aiEmployee,
  title = "Talk to your AI employee",
  description = "Type as a customer would — in English, Telugu, or Tanglish. The AI answers only from your Business Brain.",
  onTurnComplete,
}: ChatInterfaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function boot() {
      setStarting(true);
      setError(null);
      try {
        const conversation = await startConversation(business.id, aiEmployee?.id);
        if (!active) {
          return;
        }
        setConversationId(conversation.id);
        setTurns(conversation.turns);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not start conversation");
        }
      } finally {
        if (active) {
          setStarting(false);
        }
      }
    }

    boot();

    return () => {
      active = false;
    };
  }, [business.id, aiEmployee?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  async function handleSend(text: string) {
    if (!conversationId || !text.trim() || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await sendTurn(business.id, conversationId, text.trim());
      const conversation = await getConversation(business.id, conversationId);
      setTurns(conversation.turns);
      onTurnComplete?.(result);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestart() {
    if (conversationId) {
      try {
        await endConversation(business.id, conversationId);
      } catch {
        // ignore end errors on restart
      }
    }

    setTurns([]);
    setStarting(true);
    setError(null);

    try {
      const conversation = await startConversation(business.id, aiEmployee?.id);
      setConversationId(conversation.id);
      setTurns(conversation.turns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restart conversation");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card
      title={title}
      action={
        <Button variant="secondary" size="sm" onClick={handleRestart} disabled={starting}>
          New conversation
        </Button>
      }
    >
      <p className="mb-4 text-sm text-slate-600">{description}</p>

      {aiEmployee ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <span className="font-medium">{aiEmployee.name}</span>
          <span className="text-indigo-600">· {aiEmployee.status}</span>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="mb-4 h-[420px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
      >
        {starting ? (
          <p className="text-sm text-slate-500">Starting conversation…</p>
        ) : turns.length === 0 ? (
          <p className="text-sm text-slate-500">Your AI employee is ready. Say hello.</p>
        ) : (
          turns.map((turn, index) => <MessageBubble key={`${turn.at}-${index}`} turn={turn} />)
        )}
        {loading ? <p className="text-sm text-slate-500">AI is thinking…</p> : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => handleSend(prompt)}
            disabled={loading || starting || !conversationId}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend(message);
        }}
      >
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask about products, prices, policies, appointments…"
          disabled={loading || starting || !conversationId}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <Button type="submit" disabled={loading || starting || !conversationId || !message.trim()}>
          Send
        </Button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Card>
  );
}

function MessageBubble({ turn }: { turn: TurnView }) {
  const isCustomer = turn.role === "customer";
  const isSystem = turn.role === "system";

  if (isSystem) {
    return <p className="text-center text-xs text-slate-500">{turn.text}</p>;
  }

  return (
    <div className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-6 ${
          isCustomer
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
        }`}
      >
        {!isCustomer ? (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-indigo-600">AI</p>
        ) : null}
        <p>{turn.text}</p>
      </div>
    </div>
  );
}
