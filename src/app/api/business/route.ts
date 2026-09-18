import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    // 1. Check membership
    const { data: membership } = await supabase
      .from("business_members")
      .select("business_id")
      .eq("user_id", session.userId)
      .limit(1)
      .maybeSingle();

    let business = null;
    if (membership?.business_id) {
      const { data } = await supabase
        .from("businesses")
        .select("*")
        .eq("id", membership.business_id)
        .single();
      business = data;
    }

    if (!business) {
      const { data: anyBiz } = await supabase
        .from("businesses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      business = anyBiz;
    }

    return NextResponse.json({ business });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch business" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, businessId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Business name is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    let targetId = businessId;
    if (!targetId) {
      const { data: membership } = await supabase
        .from("business_members")
        .select("business_id")
        .eq("user_id", session.userId)
        .limit(1)
        .maybeSingle();
      targetId = membership?.business_id;
    }

    if (!targetId) {
      // Find latest business or create one
      const { data: anyBiz } = await supabase
        .from("businesses")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anyBiz?.id) {
        targetId = anyBiz.id;
      }
    }

    if (targetId) {
      const { data: updated, error } = await supabase
        .from("businesses")
        .update({ name: name.trim() })
        .eq("id", targetId)
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, business: updated });
    }

    // Otherwise create a new business
    const { data: created, error } = await supabase
      .from("businesses")
      .insert({
        name: name.trim(),
        status: "active",
        timezone: "Asia/Kolkata",
      })
      .select("*")
      .single();

    if (error) throw error;

    if (created?.id) {
      await supabase.from("business_members").insert({
        business_id: created.id,
        user_id: session.userId,
        role: "owner",
      });
    }

    return NextResponse.json({ success: true, business: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update business" }, { status: 500 });
  }
}
