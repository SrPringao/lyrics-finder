/** Arranca un poco antes de la línea (mismo margen que /api/spotify/play). */
export const PREROLL_MS = 1500;

/** Índice de la línea que suena: la última cuyo tiempo ya pasó (0 antes de la primera). */
export function currentLineIndex(lines: { t: number | null }[], positionMs: number): number {
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t;
    if (t == null) continue;
    if (t <= positionMs) idx = i;
    else break;
  }
  return idx;
}

/** Siguiente mención después de la posición actual (o null). Devuelve el tiempo de la línea. */
export function nextMention(mentions: number[], positionMs: number): number | null {
  const sorted = [...mentions].sort((a, b) => a - b);
  return sorted.find((m) => m - PREROLL_MS > positionMs + 300) ?? null;
}

/**
 * Mención anterior. Si se acaba de saltar a una mención (estamos dentro de sus primeros
 * segundos), "anterior" va a la de antes, como el botón de canción anterior de un reproductor.
 */
export function prevMention(mentions: number[], positionMs: number): number | null {
  const sorted = [...mentions].sort((a, b) => a - b);
  const before = sorted.filter((m) => m - PREROLL_MS < positionMs - 2500);
  return before.length ? before[before.length - 1] : null;
}

export function formatClock(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "0:00";
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
