const styles = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/10",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof styles;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
