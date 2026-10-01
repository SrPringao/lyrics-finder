// Estados reducidos: un punto pequeño más texto.
const LYRICS: Record<string, { text: string; dot: string; color: string }> = {
  synced: { text: "Sincronizada", dot: "bg-accent", color: "text-accent" },
  plain: { text: "Sin tiempos", dot: "bg-secondary", color: "text-secondary" },
  instrumental: { text: "Instrumental", dot: "bg-secondary", color: "text-secondary" },
  not_found: { text: "Sin letra", dot: "bg-warn", color: "text-warn" },
  error: { text: "Error", dot: "bg-warn", color: "text-warn" },
  pending: { text: "Pendiente", dot: "bg-secondary", color: "text-secondary" },
};

function Dot({ text, dot, color, title }: { text: string; dot: string; color: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs ${color}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

export function LyricsStatusDot({ status, manual }: { status: string; manual?: boolean }) {
  const s = LYRICS[status] ?? LYRICS.pending;
  return <Dot {...s} text={manual ? `${s.text} · manual` : s.text} />;
}

/** Vinculación con Spotify: si ya se puede reproducir desde cualquier segundo. */
export function SpotifyStatusDot({ status, uri }: { status: string | null; uri: string | null }) {
  if (uri) return <Dot text="En Spotify" dot="bg-accent" color="text-accent" title="Se puede reproducir desde cualquier segundo." />;
  if (status === "not_found")
    return <Dot text="No está en Spotify" dot="bg-warn" color="text-warn" title="Spotify no tiene esta canción; usa “Buscar en Spotify”." />;
  return <Dot text="Sin vincular" dot="bg-secondary" color="text-secondary" title="Se vincula sola la primera vez que le das reproducir." />;
}
