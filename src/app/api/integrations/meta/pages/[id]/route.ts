import { NextResponse } from "next/server";

import { canManageBusiness } from "@/lib/auth/access";
import { getSessionContext } from "@/lib/auth/session";
import type { MetaPageConnection } from "@/lib/database.types";
import { getMetaConfig, unsubscribePage } from "@/lib/meta/graph";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const { data: connection } = await supabase
    .from("meta_page_connections")
    .select("*")
    .eq("id", (await params).id)
    .maybeSingle<MetaPageConnection>();

  if (!connection || !(await canManageBusiness(supabase, session, connection.business_id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = getMetaConfig();
  if (config) {
    // Best effort: the token may already be revoked, and the row must go regardless.
    await unsubscribePage(config, connection.page_id, connection.page_access_token).catch((err) =>
      console.warn("[Meta disconnect] Unsubscribe failed:", err)
    );
  }

  await supabase.from("meta_page_connections").delete().eq("id", connection.id);
  return NextResponse.json({ deleted: true });
}
