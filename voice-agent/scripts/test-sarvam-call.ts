import fs from "fs";
import path from "path";

// Load .env manually if not already in process.env
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { triggerLeadCall } from "../src/lib/sarvam/client";

async function main() {
  const targetPhone = process.argv[2];

  if (!targetPhone) {
    console.error("Usage: npx tsx scripts/test-sarvam-call.ts <phone_number>");
    console.error("Example: npx tsx scripts/test-sarvam-call.ts +919876543210");
    process.exit(1);
  }

  console.log("--------------------------------------------------");
  console.log("Sarvam Voice Agents - Instant Outbound Test Runner");
  console.log("--------------------------------------------------");
  console.log(`Org ID:         ${process.env.SARVAM_ORG_ID}`);
  console.log(`Workspace ID:   ${process.env.SARVAM_WORKSPACE_ID}`);
  console.log(`Agent ID:       ${process.env.SARVAM_AGENT_ID || "(Missing)"}`);
  console.log(`Connection ID:  ${process.env.SARVAM_CONNECTION_ID || "(Missing)"}`);
  console.log(`From Number:    ${process.env.SARVAM_AGENT_PHONE_NUMBER || "(Missing)"}`);
  console.log(`Target Phone:   ${targetPhone}`);
  console.log("--------------------------------------------------");

  const result = await triggerLeadCall({
    customerName: "Test Lead",
    phoneNumber: targetPhone,
    reason: "lead_qualification_test",
  });

  if (result.success) {
    console.log(`✅ Success! Call attempt initiated.`);
    console.log(`Attempt ID: ${result.attemptId}`);
  } else {
    console.error(`❌ Call failed: ${result.error}`);
  }
}

main();
