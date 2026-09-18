import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function SettingsPage() {
  return <AppSectionPage meta={ownerPages.settings} showEmpty={false} />;
}
