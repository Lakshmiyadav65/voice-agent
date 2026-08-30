import { AppShell } from "@/components/shell/AppShell";
import { trainerNav } from "@/lib/navigation";

export default function TrainerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AppShell
      nav={trainerNav}
      title="Trainer console"
      subtitle="Internal AI trainer"
      homeHref="/trainer"
    >
      {children}
    </AppShell>
  );
}
