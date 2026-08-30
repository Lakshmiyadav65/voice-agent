import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";
import { trainerNav } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/resolve-nav";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function TrainerSectionPage({ params }: PageProps) {
  const { slug } = await params;
  const pathname = `/trainer/${slug.join("/")}`;
  const label = resolveNavLabel(trainerNav, pathname);

  return (
    <PlaceholderPanel
      title={label}
      description={`${label} is reserved in the trainer console. Configuration, evaluation, and deployment tools will land here in later phases.`}
      notes={[
        "Complexity stays in the trainer interface",
        "Behaviour changes require test → version → approve → deploy",
      ]}
    />
  );
}
