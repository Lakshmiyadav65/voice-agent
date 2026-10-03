import { NextResponse } from "next/server";
import { canAccessBusiness, getAccessScope, primaryBusinessId } from "@/lib/auth/access";
import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const businessIdParam = searchParams.get("businessId");

    const supabase = (await createClient()) || createAdminClient();
    const adminClient = createAdminClient();
    if (!supabase || !adminClient) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const scope = await getAccessScope(adminClient, session);
    if (businessIdParam && !canAccessBusiness(scope, businessIdParam)) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const businessId = businessIdParam || primaryBusinessId(scope);

    if (!businessId) {
      if (!scope.staff) {
        return NextResponse.json({ employees: [] });
      }

      const { data: allEmployees, error: err } = await supabase
        .from("ai_employees")
        .select("*, businesses(name)")
        .order("created_at", { ascending: false });

      if (err) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      return NextResponse.json({ employees: allEmployees || [] });
    }

    const { data: employees, error } = await supabase
      .from("ai_employees")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ employees: employees || [], businessId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Staff create each client's AI employee when adding the client; owners cannot add one.
    if (!isPlatformStaff(session.profile.platform_role)) {
      return NextResponse.json({ error: "AI employees are set up by our team." }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, role, language, tone, greeting, businessId: providedBusinessId, businessName } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Employee name is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Database client unavailable" }, { status: 500 });
    }

    const scope = await getAccessScope(adminClient, session);
    if (providedBusinessId && !canAccessBusiness(scope, providedBusinessId)) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    let businessId = providedBusinessId || primaryBusinessId(scope);

    if (!businessId) {
      // Auto-create a business for this user
      const { data: newBiz } = await adminClient
        .from("businesses")
        .insert({
          name: businessName?.trim() || "My Business",
          industry: "general",
          status: "active",
        })
        .select("id")
        .single();

      if (newBiz) {
        businessId = newBiz.id;
        await adminClient.from("business_members").insert({
          business_id: businessId,
          user_id: session.userId,
          role: "owner",
        });
      }
    } else if (businessName && businessName.trim()) {
      // Update existing business name if specified
      await adminClient
        .from("businesses")
        .update({ name: businessName.trim() })
        .eq("id", businessId);
    }

    if (!businessId) {
      return NextResponse.json(
        { error: "Could not initialize business account. Please try again." },
        { status: 500 }
      );
    }

    // Insert AI employee into ai_employees table
    const fullDescription = [
      description?.trim(),
      role ? `Role: ${role}` : null,
      language ? `Primary Language: ${language}` : null,
      tone ? `Tone: ${tone}` : null,
      greeting ? `Greeting: ${greeting}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const { data: employee, error } = await adminClient
      .from("ai_employees")
      .insert({
        business_id: businessId,
        name: name.trim(),
        description: fullDescription || "Inbound sales and customer voice agent",
        status: "testing",
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ employee }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
