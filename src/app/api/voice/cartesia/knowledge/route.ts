import { NextResponse } from "next/server";

import { answerFromKnowledge, findAgentOwner } from "@/lib/cartesia/agents";
import { hasCartesiaSecret } from "@/lib/cartesia/webhook";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The agent's knowledge lookup, called by Cartesia's "business_knowledge" webhook tool
 * during a call with { question, agent_id }. Answers in plain text, which Cartesia passes
 * to the model as the tool result, so the client's knowledge base stays on our platform.
 */
export async function POST(request: Request) {
  if (!hasCartesiaSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { question?: unknown; agent_id?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.slice(0, 500) : "";
  const agentId = typeof body?.agent_id === "string" ? body.agent_id : undefined;

  const supabase = createAdminClient();
  if (!supabase) return new NextResponse("Business information is unavailable right now.", { status: 503 });

  const owner = await findAgentOwner(supabase, agentId);
  if (!owner) {
    return text(
      "This agent is not linked to a business yet, so there are no business facts. Say you will check and have the team call back."
    );
  }

  try {
    return text(await answerFromKnowledge(supabase, owner, question));
  } catch (err) {
    console.error("[Cartesia knowledge]", err);
    return new NextResponse("Business information is unavailable right now.", { status: 500 });
  }
}

function text(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
