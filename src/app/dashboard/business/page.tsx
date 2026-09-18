import Link from "next/link";

import { AppSectionPage } from "@/components/shell/AppSectionPage";
import { businessInfoNav, ownerPages } from "@/lib/pages";

export default function BusinessHubPage() {
  return (
    <AppSectionPage meta={ownerPages.businessHub} showEmpty={false}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {businessInfoNav
          .filter((item) => item.href !== "/dashboard/business")
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border border-border bg-surface px-5 py-4 transition hover:border-accent"
            >
              <p className="font-medium text-ink">{item.label}</p>
              <p className="mt-1 text-sm text-muted">Manage {item.label.toLowerCase()}</p>
            </Link>
          ))}
      </div>
    </AppSectionPage>
  );
}
