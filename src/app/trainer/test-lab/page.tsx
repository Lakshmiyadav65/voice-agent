import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerTestLabPage() {
  return <AppSectionPage meta={trainerPages.testLab} showEmpty={false} />;
}
