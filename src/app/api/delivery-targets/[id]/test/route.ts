import { NextResponse } from "next/server";

import { getSessionContext } from "@/lib/auth/session";
import { loadManageableTarget } from "@/lib/delivery/access";
import { sendTestDelivery } from "@/lib/delivery/deliver";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase, target } = await loadManageableTarget(session, (await params).id);
  if (!supabase || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", target.business_id)
    .single();
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await sendTestDelivery(supabase, target, business);
  return NextResponse.json(result.ok ? { ok: true } : { ok: false, error: result.error });
}
