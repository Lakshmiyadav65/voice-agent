import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function ProductsPage() {
  return <AppSectionPage meta={ownerPages.products} />;
}
