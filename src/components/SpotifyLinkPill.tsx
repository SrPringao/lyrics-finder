const STYLES = {
  matched: { text: "Vinculada a Spotify", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", hint: "Se puede reproducir desde cualquier segundo." },
  not_found: { text: "No está en Spotify", cls: "bg-red-50 text-red-700 ring-red-200", hint: "Spotify no tiene esta canción; usa “Buscar en Spotify”." },
  pending: { text: "Sin vincular", cls: "bg-stone-100 text-stone-600 ring-stone-200", hint: "Se vincula sola la primera vez que le das reproducir." },
} as const;

/** Estado de la vinculación con Spotify de una canción. */
export function SpotifyLinkPill({ status, uri }: { status: string | null; uri: string | null }) {
  const s = uri ? STYLES.matched : status === "not_found" ? STYLES.not_found : STYLES.pending;
  return (
    <span title={s.hint} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}>
      {s.text}
    </span>
  );
}
