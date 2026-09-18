import { AppShell } from "@/components/shell/AppShell";
import { requireTrainerAccess } from "@/lib/auth/session";
import { trainerNav } from "@/lib/navigation";

export default async function TrainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireTrainerAccess();

  return (
    <AppShell
      nav={trainerNav}
      title="Trainer console"
      subtitle="Internal AI trainer"
      homeHref="/trainer"
      userLabel={session.profile.full_name ?? session.email}
    >
      {children}
    </AppShell>
  );
}
