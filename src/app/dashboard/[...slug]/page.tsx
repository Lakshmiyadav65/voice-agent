import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";
import { ownerNav } from "@/lib/navigation";
import { resolveNavLabel } from "@/lib/resolve-nav";

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export default async function DashboardSectionPage({ params }: PageProps) {
  const { slug } = await params;
  const pathname = `/dashboard/${slug.join("/")}`;
  const label = resolveNavLabel(ownerNav, pathname);

  return (
    <PlaceholderPanel
      title={label}
      description={`${label} is reserved in the business-owner shell. Data, forms, and actions arrive in later phases — this route confirms navigation and layout.`}
      notes={[
        "Business owners manage approved facts, not AI internals",
        "Technical concepts stay out of this interface",
      ]}
    />
  );
}
