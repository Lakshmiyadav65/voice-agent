"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { homePathForRole, useAuth } from "@/contexts/auth-context";

export function RequireAuth({
  children,
  internalOnly = false,
}: {
  children: ReactNode;
  internalOnly?: boolean;
}) {
  const router = useRouter();
  const { user, loading, isInternal } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace("/login");
      return;
    }
    if (internalOnly && !isInternal) {
      router.replace("/dashboard");
    }
  }, [user, loading, internalOnly, isInternal, router]);

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Loading your workspace…
      </div>
    );
  }

  if (!user || (internalOnly && !isInternal)) {
    return null;
  }

  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace(homePathForRole(user.role));
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex min-h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
