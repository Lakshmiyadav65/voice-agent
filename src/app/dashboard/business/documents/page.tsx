import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function DocumentsPage() {
  return <AppSectionPage meta={ownerPages.documents} />;
}
