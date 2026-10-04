"use client";

import Link from "next/link";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

const input =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm outline-none transition focus:border-accent";

/**
 * Emails a password reset link. The link signs the person in through /auth/callback
 * and lands on /reset-password. Supabase replies the same whether or not the email has
 * an account, so the form cannot be used to find out who is a client.
 */
export function ForgotPasswordForm({ initialError = null }: { initialError?: string | null }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter the email you log in with.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Could not connect to Supabase.");
      return;
    }

    setSending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setSending(false);
    // Supabase answers an unknown email with success, so none of these reveal who has an account.
    if (resetError) {
      setError(
        resetError.code === "email_address_invalid"
          ? "Enter a valid email address."
          : resetError.status === 429 || resetError.code === "over_email_send_rate_limit"
            ? "Too many reset emails were sent just now. Wait a few minutes and try again."
            : // e.g. email_address_not_authorized: the project's email sender is not set up for outside addresses yet.
              "We could not send the email. Ask our team to reset your password."
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-foreground">
          If <span className="font-semibold">{email.trim()}</span> has an account, a link to set a new password is on its
          way. Open it in this same browser.
        </p>
        <p className="text-muted">No email after a few minutes? Check spam, or ask our team to reset your password.</p>
        <Link href="/login" className="inline-block font-semibold text-accent hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@business.in"
          className={input}
        />
      </label>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60"
      >
        {sending ? "Sending…" : "Email me a reset link"}
      </button>

      <Link href="/login" className="block text-center text-sm text-muted hover:text-accent">
        Back to log in
      </Link>
    </form>
  );
}
