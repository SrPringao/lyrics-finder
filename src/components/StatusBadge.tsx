const LABELS: Record<string, { text: string; cls: string }> = {
  synced: { text: "Sincronizada", cls: "bg-emerald-100 text-emerald-800" },
  plain: { text: "Sin tiempos", cls: "bg-sky-100 text-sky-800" },
  instrumental: { text: "Instrumental", cls: "bg-violet-100 text-violet-800" },
  not_found: { text: "No encontrada", cls: "bg-amber-100 text-amber-800" },
  error: { text: "Error", cls: "bg-red-100 text-red-800" },
  pending: { text: "Pendiente", cls: "bg-stone-100 text-stone-600" },
};

export function StatusBadge({ status, manual }: { status: string; manual?: boolean }) {
  const l = LABELS[status] ?? LABELS.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${l.cls}`}>
      {l.text}
      {manual ? " · manual" : ""}
    </span>
  );
}
