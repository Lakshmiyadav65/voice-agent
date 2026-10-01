import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

import { isPlatformStaff } from "@/lib/auth/roles";
import { getSessionContext } from "@/lib/auth/session";

/** One Sarvam agent serves every business, so only platform staff may view or change it. */
async function requireStaff() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPlatformStaff(session.profile.platform_role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireStaff();
  if (denied) return denied;

  return NextResponse.json({
    apiKeyConfigured: Boolean(process.env.SARVAM_API_KEY),
    orgId: process.env.SARVAM_ORG_ID || "",
    workspaceId: process.env.SARVAM_WORKSPACE_ID || "",
    agentId: process.env.SARVAM_AGENT_ID || "",
    connectionId: process.env.SARVAM_CONNECTION_ID || "",
    agentPhoneNumber: process.env.SARVAM_AGENT_PHONE_NUMBER || "+918064266290",
    agentVersion: process.env.SARVAM_AGENT_VERSION || "1",
  });
}

export async function POST(request: Request) {
  const denied = await requireStaff();
  if (denied) return denied;

  try {
    const { agentId, connectionId, agentPhoneNumber, agentVersion } = await request.json();

    const envPath = path.resolve(process.cwd(), ".env");
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf8");
    }

    function updateOrAppend(key: string, value: string) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content += `\n${key}=${value}`;
      }
      process.env[key] = value;
    }

    if (agentId !== undefined) updateOrAppend("SARVAM_AGENT_ID", agentId.trim());
    if (connectionId !== undefined) updateOrAppend("SARVAM_CONNECTION_ID", connectionId.trim());
    if (agentPhoneNumber !== undefined) updateOrAppend("SARVAM_AGENT_PHONE_NUMBER", agentPhoneNumber.trim());
    if (agentVersion !== undefined) updateOrAppend("SARVAM_AGENT_VERSION", String(agentVersion).trim());

    fs.writeFileSync(envPath, content, "utf8");

    return NextResponse.json({
      success: true,
      message: "Sarvam Voice Agent configuration updated successfully",
      config: {
        agentId: process.env.SARVAM_AGENT_ID,
        connectionId: process.env.SARVAM_CONNECTION_ID,
        agentPhoneNumber: process.env.SARVAM_AGENT_PHONE_NUMBER,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update config" },
      { status: 500 }
    );
  }
}
