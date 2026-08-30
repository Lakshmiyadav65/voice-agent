import type { NavItem } from "@/lib/navigation";

export function resolveNavLabel(nav: NavItem[], pathname: string): string {
  const exact = nav.find((item) => item.href === pathname);
  if (exact) return exact.label;

  const nested = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname.startsWith(`${item.href}/`));

  return nested?.label ?? nav[0]?.label ?? "Overview";
}
