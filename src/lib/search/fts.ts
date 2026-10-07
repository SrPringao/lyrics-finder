import type { DB } from "@/lib/db";

export type SearchMode = "palabra" | "contiene";

/** En modo "contiene" cada término necesita al menos 3 letras (así funciona el índice por trigramas). */
export const MIN_CONTAINS_LENGTH = 3;

export const HL_START = "\u0001";
export const HL_END = "\u0002";

/** Los índices guardan ñ/Ñ como este carácter para que no se pliegue a "n" (ver migración v7). */
const ENYE = "\uE000";
const protectEnye = (s: string) => s.normalize("NFC").replace(/[ñÑ]/g, ENYE);

/** Devuelve las ñ al texto resaltado usando la línea original (cada ñ ocupa un solo carácter en ambos). */
function restoreEnye(highlighted: string, original: string): string {
  if (!highlighted.includes(ENYE)) return highlighted;
  let i = 0;
  let out = "";
  for (const ch of highlighted) {
    if (ch === HL_START || ch === HL_END) {
      out += ch;
      continue;
    }
    out += ch === ENYE ? original[i] : ch;
    i += ch.length;
  }
  return out;
}

/**
 * Convierte lo que escribe el usuario en una expresión FTS5 segura:
 *  - varias palabras seguidas se buscan juntas y en ese orden, como frase ("me cocina")
 *  - cada texto entre comillas es su propia frase; varias frases se combinan con AND
 *    (`"me" "cocina"` busca las dos palabras en cualquier parte de la línea)
 *  - palabra* al final activa búsqueda por prefijo (modo "palabra")
 *  - todo se cita, así caracteres como - : * ( no rompen la consulta
 * En modo "contiene" las frases de menos de 3 letras se ignoran y se reportan en `ignored`.
 */
export function parseQuery(input: string, mode: SearchMode = "palabra"): { match: string | null; ignored: string[] } {
  const parts: string[] = [];
  const ignored: string[] = [];
  const tooShort = (t: string) => mode === "contiene" && [...t].length < MIN_CONTAINS_LENGTH;
  const hasText = (w: string) => /[\p{L}\p{N}]/u.test(w);

  const pushPhrase = (words: string[], prefix: boolean) => {
    // Palabras que solo son puntuación no aportan nada (y FTS5 las rechazaría).
    const clean = words.map((w) => w.replace(/["*]/g, "")).filter(hasText);
    if (clean.length === 0) return;
    const phrase = clean.join(" ");
    if (tooShort(phrase)) {
      ignored.push(phrase);
      return;
    }
    // En "contiene" ya se busca dentro de las palabras: el * no hace falta.
    parts.push(`"${protectEnye(phrase)}"${prefix && mode === "palabra" ? "*" : ""}`);
  };

  let run: string[] = [];
  const flush = () => {
    if (run.length) pushPhrase(run, /\*$/.test(run[run.length - 1]));
    run = [];
  };

  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m[1] !== undefined) {
      flush();
      pushPhrase(m[1].trim().split(/\s+/), false);
    } else {
      run.push(m[2]);
    }
  }
  flush();
  return { match: parts.length ? parts.join(" AND ") : null, ignored };
}

export function buildMatchQuery(input: string, mode: SearchMode = "palabra"): string | null {
  return parseQuery(input, mode).match;
}

export interface LineHit {
  lineId: number;
  lineIndex: number;
  timeMs: number | null;
  /** Relevancia de FTS5 (menor = mejor). */
  rank: number;
  /** Texto con las coincidencias marcadas entre HL_START y HL_END. */
  highlighted: string;
  before: string | null;
  after: string | null;
}

export interface TrackHits {
  trackId: number;
  title: string;
  artist: string;
  album: string | null;
  spotifyUri: string | null;
  spotifyStatus: string | null;
  coverUrl: string | null;
  lyricsStatus: string;
  hits: LineHit[];
}

export interface SearchResult {
  query: string;
  mode: SearchMode;
  match: string | null;
  /** Términos ignorados por ser muy cortos (modo "contiene"). */
  ignored: string[];
  totalLines: number;
  tracks: TrackHits[];
  truncated: boolean;
}

export function searchLyrics(
  db: DB,
  query: string,
  opts: { playlistId?: number | null; limit?: number; mode?: SearchMode } = {},
): SearchResult {
  const mode = opts.mode ?? "palabra";
  const { match, ignored } = parseQuery(query, mode);
  const empty: SearchResult = { query, mode, match, ignored, totalLines: 0, tracks: [], truncated: false };
  if (!match) return empty;
  const limit = opts.limit ?? 500;

  // Nombre fijo según el modo (nunca viene del usuario).
  const fts = mode === "contiene" ? "lyric_lines_tri" : "lyric_lines_fts";
  const playlistFilter = opts.playlistId
    ? "AND ll.track_id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id = @playlistId)"
    : "";

  const rows = db
    .prepare(
      `SELECT ll.id AS lineId, ll.track_id AS trackId, ll.line_index AS lineIndex, ll.time_ms AS timeMs,
              highlight(${fts}, 0, @hs, @he) AS highlighted, ll.text AS original,
              prev.text AS before, next.text AS after,
              t.title, t.artist, t.album, t.spotify_uri AS spotifyUri, t.spotify_status AS spotifyStatus, t.cover_url AS coverUrl, t.lyrics_status AS lyricsStatus,
              ${fts}.rank AS rank
       FROM ${fts}
       JOIN lyric_lines ll ON ll.id = ${fts}.rowid
       JOIN tracks t ON t.id = ll.track_id
       LEFT JOIN lyric_lines prev ON prev.track_id = ll.track_id AND prev.line_index = ll.line_index - 1
       LEFT JOIN lyric_lines next ON next.track_id = ll.track_id AND next.line_index = ll.line_index + 1
       WHERE ${fts} MATCH @match ${playlistFilter}
       ORDER BY rank
       LIMIT @limit`,
    )
    .all({ match, hs: HL_START, he: HL_END, playlistId: opts.playlistId ?? null, limit: limit + 1 }) as (LineHit &
    Omit<TrackHits, "hits"> & { rank: number; original: string })[];

  const truncated = rows.length > limit;
  const byTrack = new Map<number, TrackHits & { bestRank: number }>();
  for (const r of rows.slice(0, limit)) {
    let group = byTrack.get(r.trackId);
    if (!group) {
      group = {
        trackId: r.trackId,
        title: r.title,
        artist: r.artist,
        album: r.album,
        spotifyUri: r.spotifyUri,
        spotifyStatus: r.spotifyStatus,
        coverUrl: r.coverUrl,
        lyricsStatus: r.lyricsStatus,
        hits: [],
        bestRank: r.rank,
      };
      byTrack.set(r.trackId, group);
    }
    group.hits.push({
      lineId: r.lineId,
      lineIndex: r.lineIndex,
      timeMs: r.timeMs,
      rank: r.rank,
      highlighted: restoreEnye(r.highlighted, r.original),
      before: r.before,
      after: r.after,
    });
  }

  // Canciones con más menciones primero; dentro de cada una, en orden de aparición.
  const tracks = [...byTrack.values()]
    .sort((a, b) => b.hits.length - a.hits.length || a.bestRank - b.bestRank)
    .map((t) => ({
      trackId: t.trackId,
      title: t.title,
      artist: t.artist,
      album: t.album,
      spotifyUri: t.spotifyUri,
      spotifyStatus: t.spotifyStatus,
      coverUrl: t.coverUrl,
      lyricsStatus: t.lyricsStatus,
      hits: t.hits.sort((a, b) => a.lineIndex - b.lineIndex),
    }));

  return { query, mode, match, ignored, totalLines: Math.min(rows.length, limit), tracks, truncated };
}

/** Parte un texto resaltado en segmentos para pintarlo sin dangerouslySetInnerHTML. */
export function splitHighlighted(text: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  const re = new RegExp(`${HL_START}([^${HL_END}]*)${HL_END}`, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mark: false });
    out.push({ text: m[1], mark: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false });
  return out;
}
