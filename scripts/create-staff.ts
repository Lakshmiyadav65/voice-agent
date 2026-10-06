/**
 * Creates a staff login (admin or trainer) with a strong random password, or resets the
 * password of an existing account and makes it staff. The password is printed once here.
 *
 *   npm run staff:create -- you@gmail.com            (admin)
 *   npm run staff:create -- someone@gmail.com trainer
 *
 * Use a Gmail address to also sign in with Google.
 */
import { randomBytes } from "crypto";

import { createClient } from "@supabase/supabase-js";

const ROLES = ["admin", "trainer"] as const;
type StaffRole = (typeof ROLES)[number];

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const role = (process.argv[3] ?? "admin") as StaffRole;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role)) {
    console.error("Usage: npm run staff:create -- <email> [admin|trainer]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const password = randomBytes(12).toString("base64url");
  const fullName = email.split("@")[0];

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    // app_metadata, not user_metadata: the new-user trigger only trusts what the service role sets.
    app_metadata: { platform_role: role },
  });

  let userId = created?.user?.id;
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) throw error;
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw error;
    userId = existing.id;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      app_metadata: { platform_role: role },
    });
    if (updateError) throw updateError;
  }

  // The trigger set the role for a new account; an existing one needs its profile updated.
  const { error: profileError } = await admin.from("profiles").update({ platform_role: role }).eq("id", userId!);
  if (profileError) throw profileError;

  console.log(`\n${error ? "Updated" : "Created"} ${role} login`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  Log in:   ${process.env.APP_PUBLIC_URL?.trim() || "http://localhost:3000"}/login\n`);
}

main().catch((err) => {
  console.error("Could not create the staff login:", err.message ?? err);
  process.exit(1);
});
