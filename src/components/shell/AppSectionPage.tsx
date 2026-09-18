import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PageMeta } from "@/lib/pages";

type AppSectionPageProps = {
  meta: PageMeta;
  children?: React.ReactNode;
  showEmpty?: boolean;
};

export function AppSectionPage({ meta, children, showEmpty = true }: AppSectionPageProps) {
  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        breadcrumbs={meta.breadcrumbs}
        badge={meta.comingInPhase ? `Arrives in ${meta.comingInPhase}` : undefined}
      />

      {children}

      {meta.features && meta.features.length > 0 ? (
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Planned capabilities
          </h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {meta.features.map((feature) => (
              <li
                key={feature}
                className="flex gap-2 text-sm text-foreground"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showEmpty && meta.emptyTitle && meta.emptyDescription ? (
        <div className="mt-8">
          <EmptyState title={meta.emptyTitle} description={meta.emptyDescription} />
        </div>
      ) : null}
    </div>
  );
}
