import { PlaceholderPanel } from "@/components/ui/PlaceholderPanel";

export default function TrainerPage() {
  return (
    <PlaceholderPanel
      title="Trainer dashboard"
      description="Trainers prepare Business Brains, configure AI employees, run tests, and deploy approved versions. Phase 1 establishes the console shell and navigation."
      notes={[
        "Business setup and Business Brain preparation",
        "Test Lab, knowledge gaps, and conversation review",
        "Versioning: draft → testing → approved → live",
      ]}
    />
  );
}
