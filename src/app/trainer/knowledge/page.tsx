import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { trainerPages } from "@/lib/pages";

export default function TrainerKnowledgePage() {
  return <AppSectionPage meta={trainerPages.knowledge} showEmpty={false} />;
}
