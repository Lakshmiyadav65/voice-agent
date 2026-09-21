import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { requireTrainerAccess } from "@/lib/auth/session";
import { getKnowledgeGapsAcrossBusinesses } from "@/lib/data/call-analytics";
import { trainerPages } from "@/lib/pages";

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function TrainerKnowledgeGapsPage() {
  await requireTrainerAccess();
  const gaps = await getKnowledgeGapsAcrossBusinesses();

  return (
    <AppSectionPage meta={trainerPages.knowledgeGaps} showEmpty={gaps.length === 0}>
      {gaps.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm text-muted">
            Questions callers asked that the AI could not answer. Each one is a gap
            in the business knowledge — adding it will stop the agent stumbling on
            the same question again.
          </p>

          <ul className="mt-6 space-y-3">
            {gaps.map((gap) => (
              <li
                key={gap.question}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">&ldquo;{gap.question}&rdquo;</p>
                  <p className="mt-1 text-xs text-muted">
                    Last asked {formatWhen(gap.lastAskedAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    gap.count > 1 ? "bg-accent text-white" : "bg-border/40 text-foreground"
                  }`}
                >
                  asked {gap.count}×
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </AppSectionPage>
  );
}
