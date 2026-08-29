import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { RedirectIfAuthed } from "@/components/auth/require-auth";

export default function LoginPage() {
  return (
    <RedirectIfAuthed>
      <div className="min-h-full bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                AI
              </div>
              <span className="text-lg font-semibold">AI Employee Platform</span>
            </Link>
            <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
              Back to home
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-12">
          <LoginForm />
        </main>
      </div>
    </RedirectIfAuthed>
  );
}
