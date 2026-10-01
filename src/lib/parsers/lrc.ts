export interface LyricLine {
  /** null cuando la letra no está sincronizada. */
  timeMs: number | null;
  text: string;
}

const LEADING_TIME_TAG = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const META_TAG = /^\[([a-zA-Z#]+):(.*)\]\s*$/;
// Marcas por palabra del formato "enhanced LRC": <00:12.34>
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function toMs(min: string, sec: string, frac: string | undefined): number {
  const f = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  return Number(min) * 60_000 + Number(sec) * 1000 + f;
}

/**
 * Convierte LRC en líneas con tiempo. Ignora etiquetas de metadatos ([ar:], [ti:],
 * [length:]…), aplica [offset:], expande líneas con varias marcas y descarta las
 * líneas sin texto (pausas instrumentales).
 */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  let offset = 0;

  for (const rawLine of lrc.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const meta = line.match(META_TAG);
    if (meta && !/^\d/.test(meta[1])) {
      if (meta[1].toLowerCase() === "offset") offset = Number(meta[2].trim()) || 0;
      continue;
    }

    const times: number[] = [];
    let rest = line;
    // Las marcas de tiempo van al inicio de la línea, posiblemente varias seguidas.
    while (true) {
      const m = LEADING_TIME_TAG.exec(rest);
      if (!m) break;
      times.push(toMs(m[1], m[2], m[3]));
      rest = rest.slice(m[0].length);
    }
    if (times.length === 0) continue;

    const text = rest.replace(WORD_TAG, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    // LRCLIB usa offset positivo = la letra aparece antes.
    for (const t of times) out.push({ timeMs: Math.max(0, t - offset), text });
  }

  return out.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
}

export function parsePlain(text: string): LyricLine[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((t) => ({ timeMs: null, text: t }));
}

/** ¿El texto pegado por el usuario es LRC? (al menos 2 líneas con marca de tiempo) */
export function looksLikeLrc(text: string): boolean {
  return (text.match(/^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/gm) ?? []).length >= 2;
}

/** De LRC a texto plano (para guardar plain_lyrics si solo tenemos la versión sincronizada). */
export function lrcToPlain(lrc: string): string {
  return parseLrc(lrc)
    .map((l) => l.text)
    .join("\n");
}

export function formatTime(ms: number | null): string {
  if (ms == null) return "";
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
