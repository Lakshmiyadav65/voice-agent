import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { ownerPages } from "@/lib/pages";

export default function AppointmentsPage() {
  return <AppSectionPage meta={ownerPages.appointments} />;
}
