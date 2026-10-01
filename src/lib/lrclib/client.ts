import { lrcToPlain } from "@/lib/parsers/lrc";

export const LRCLIB_BASE = "https://lrclib.net/api";
export const USER_AGENT = "LetrasPlaylist/0.1 (uso personal)";

export type LyricsStatus = "synced" | "plain" | "instrumental" | "not_found";

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsResult {
  status: LyricsStatus;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  lrclibId: number | null;
  /** Cómo se encontró (para depurar coincidencias raras). */
  matchedVia: string | null;
}

export interface TrackQuery {
  title: string;
  artist: string; // primer artista
  album?: string | null;
  durationSec?: number | null;
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DURATION_TOLERANCE_SEC = 3;

// ---------------------------------------------------------------------------
// Limpieza de títulos
// ---------------------------------------------------------------------------

const SUFFIX_KEYWORDS =
  /\b(remaster(ed)?|live|en vivo|ao vivo|radio edit|edit|single version|album version|version|versi[oó]n|mono|stereo|mix|demo|acoustic|ac[uú]stic[ao]|bonus track|explicit|clean|from .+|feat\.?|ft\.?|with|con|soundtrack|deluxe|anniversary|\d{4})\b/i;

/**
 * Quita sufijos que no forman parte del nombre "real" de la canción:
 * " - Remastered 2011", " - Live", "(feat. X)", "[Radio Edit]", etc.
 */
export function cleanTitle(title: string): string {
  let t = title;
  // (feat. X), [feat. X], (with X), (Remastered 2009)…
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (whole, inner: string) => (SUFFIX_KEYWORDS.test(inner) ? "" : whole));
  // feat. sin paréntesis: "Canción feat. Alguien"
  t = t.replace(/\s+(feat\.?|ft\.?|featuring)\s+.+$/i, "");
  // " - Remastered 2011", " - Live at Wembley", " – Radio Edit"
  t = t.replace(/\s+[-–—]\s+([^-–—]+)$/, (whole, suffix: string) => (SUFFIX_KEYWORDS.test(suffix) ? "" : whole));
  t = t.replace(/\s{2,}/g, " ").trim();
  return t || title.trim();
}

export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// HTTP con reintentos
// ---------------------------------------------------------------------------

export class LrclibHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function requestJson<T>(url: string, opts: ClientOptions): Promise<T | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 4;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    let networkError: unknown = null;
    try {
      res = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
    } catch (err) {
      networkError = err;
    }

    if (res?.ok) return (await res.json()) as T;
    if (res?.status === 404) return null;

    const retryable = networkError != null || res!.status === 429 || res!.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      if (networkError) throw networkError;
      throw new LrclibHttpError(res!.status, `LRCLIB respondió ${res!.status}`);
    }

    const retryAfter = Number(res?.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseDelay * 2 ** attempt + Math.random() * baseDelay * 0.5;
    await sleep(delay);
  }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function getExact(q: TrackQuery, opts: ClientOptions = {}): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({ track_name: q.title, artist_name: q.artist });
  if (q.album) params.set("album_name", q.album);
  if (q.durationSec) params.set("duration", String(q.durationSec));
  return requestJson<LrclibRecord>(`${LRCLIB_BASE}/get?${params}`, opts);
}

export async function search(title: string, artist: string, opts: ClientOptions = {}): Promise<LrclibRecord[]> {
  const params = new URLSearchParams({ track_name: title });
  if (artist) params.set("artist_name", artist);
  return (await requestJson<LrclibRecord[]>(`${LRCLIB_BASE}/search?${params}`, opts)) ?? [];
}

const hasLyrics = (r: LrclibRecord) => r.instrumental || !!r.syncedLyrics || !!r.plainLyrics;

/**
 * Elige el mejor resultado de /search: dentro de ±3 s de duración, prefiriendo
 * letra sincronizada y luego la duración más cercana. Si no hay duración conocida,
 * exige que el título coincida.
 */
export function pickBestSearchResult(
  results: LrclibRecord[],
  q: { title: string; durationSec?: number | null },
): LrclibRecord | null {
  const wanted = normalizeForCompare(cleanTitle(q.title));
  const candidates = results.filter(hasLyrics).filter((r) => {
    if (q.durationSec) return r.duration != null && Math.abs(r.duration - q.durationSec) <= DURATION_TOLERANCE_SEC;
    return normalizeForCompare(cleanTitle(r.trackName)) === wanted;
  });
  if (candidates.length === 0) return null;

  const dist = (r: LrclibRecord) => (q.durationSec && r.duration != null ? Math.abs(r.duration - q.durationSec) : 0);
  return [...candidates].sort((a, b) => {
    const syncDiff = Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics);
    return syncDiff !== 0 ? syncDiff : dist(a) - dist(b);
  })[0];
}

export function toResult(record: LrclibRecord | null, matchedVia: string | null): LyricsResult {
  if (!record) return { status: "not_found", plainLyrics: null, syncedLyrics: null, lrclibId: null, matchedVia: null };
  if (record.instrumental) {
    return { status: "instrumental", plainLyrics: null, syncedLyrics: null, lrclibId: record.id, matchedVia };
  }
  const synced = record.syncedLyrics?.trim() || null;
  const plain = record.plainLyrics?.trim() || (synced ? lrcToPlain(synced) : null);
  if (synced) return { status: "synced", plainLyrics: plain, syncedLyrics: synced, lrclibId: record.id, matchedVia };
  if (plain) return { status: "plain", plainLyrics: plain, syncedLyrics: null, lrclibId: record.id, matchedVia };
  return { status: "not_found", plainLyrics: null, syncedLyrics: null, lrclibId: null, matchedVia: null };
}

/**
 * Estrategia completa:
 *  1. /get con título limpio  (y luego con el original si es distinto)
 *  2. /search con título limpio (y luego original), eligiendo por duración
 * Si /get devuelve una versión sin tiempos, se intenta /search para conseguir una sincronizada.
 */
export async function fetchLyrics(q: TrackQuery, opts: ClientOptions = {}): Promise<LyricsResult> {
  const cleaned = cleanTitle(q.title);
  const titles = cleaned !== q.title.trim() ? [cleaned, q.title.trim()] : [cleaned];

  let plainFallback: LyricsResult | null = null;

  for (const title of titles) {
    const rec = await getExact({ ...q, title }, opts);
    if (rec && hasLyrics(rec)) {
      const r = toResult(rec, title === cleaned ? "get" : "get:original");
      if (r.status !== "plain") return r;
      plainFallback ??= r;
      break;
    }
  }

  for (const title of titles) {
    const best = pickBestSearchResult(await search(title, q.artist, opts), { title, durationSec: q.durationSec });
    if (best) {
      const r = toResult(best, title === cleaned ? "search" : "search:original");
      if (r.status !== "plain" || !plainFallback) return r;
    }
  }

  return plainFallback ?? toResult(null, null);
}
