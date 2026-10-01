import Papa from "papaparse";

export type PlaylistSource = "spotify" | "apple" | "csv";

export interface ParsedTrack {
  title: string;
  /** Todos los artistas tal como vienen, unidos con ", ". */
  artist: string;
  /** Primer artista: es el que se usa para buscar letras. */
  primaryArtist: string;
  album: string | null;
  durationSec: number | null;
  source: PlaylistSource;
  spotifyUri?: string;
  /** Código ISRC de la grabación: permite encontrar la canción exacta en Spotify. */
  isrc?: string;
  appleId?: string;
}

export interface ParsedPlaylist {
  source: PlaylistSource;
  encoding: string;
  delimiter: string;
  tracks: ParsedTrack[];
  /** Filas que se descartaron (sin título) — útil para avisar en la UI. */
  skipped: number;
  /** Nombre de playlist que venga dentro del archivo (TuneMyMusic/Soundiiz lo incluyen). */
  playlistName?: string;
}

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

export function decodeBuffer(input: Uint8Array): { text: string; encoding: string } {
  const b = input;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "utf-16le" };
  }
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(b.subarray(2)), encoding: "utf-16be" };
  }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(b.subarray(3)), encoding: "utf-8" };
  }

  // Sin BOM: UTF-16 de texto mayormente ASCII tiene muchos bytes 0 en posiciones alternas.
  const sample = b.subarray(0, Math.min(b.length, 4000));
  let zerosEven = 0;
  let zerosOdd = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      if (i % 2 === 0) zerosEven++;
      else zerosOdd++;
    }
  }
  const half = sample.length / 2;
  if (half > 0 && zerosOdd / half > 0.3) {
    return { text: new TextDecoder("utf-16le").decode(b), encoding: "utf-16le" };
  }
  if (half > 0 && zerosEven / half > 0.3) {
    return { text: new TextDecoder("utf-16be").decode(b), encoding: "utf-16be" };
  }

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b), encoding: "utf-8" };
  } catch {
    // Exportaciones viejas de iTunes pueden venir en una codificación de 8 bits.
    return { text: new TextDecoder("windows-1252").decode(b), encoding: "windows-1252" };
  }
}

// ---------------------------------------------------------------------------
// Encabezados
// ---------------------------------------------------------------------------

export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Field = "title" | "artist" | "album" | "durationMs" | "durationSec" | "uri" | "isrc" | "appleId" | "playlist";

// Alias en orden de preferencia (ya normalizados). Se busca coincidencia exacta
// primero para no confundir "Album Artist Name(s)" con "Artist Name(s)".
const ALIASES: Record<Field, string[]> = {
  title: ["trackname", "name", "title", "songname", "song", "track", "nombre", "titulo", "cancion"],
  artist: ["artistnames", "artistname", "artists", "artist", "artista", "artistas", "interprete"],
  album: ["albumname", "album"],
  durationMs: ["durationms", "trackdurationms", "duracionms"],
  durationSec: ["time", "duration", "durationsec", "durations", "tiempo", "duracion", "length"],
  uri: ["trackuri", "spotifyuri", "uri", "spotifytrackuri"],
  isrc: ["isrc", "trackisrc"],
  appleId: ["appleid", "applemusicid", "itunesid"],
  playlist: ["playlistname", "playlist"],
};

// Para la coincidencia aproximada: palabras clave + palabras que la descartan.
const FUZZY: Record<Field, { must: string[]; not: string[] }> = {
  title: { must: ["trackname", "songname", "titulo", "title"], not: ["album", "artist"] },
  artist: { must: ["artist"], not: ["album", "id", "uri", "genre"] },
  album: { must: ["album"], not: ["artist", "id", "uri", "date", "type", "image"] },
  durationMs: { must: ["ms"], not: [] },
  durationSec: { must: ["duration", "duracion", "time", "tiempo"], not: ["ms", "added", "modified", "played", "skipped"] },
  uri: { must: ["uri"], not: ["artist", "album"] },
  isrc: { must: ["isrc"], not: [] },
  appleId: { must: ["apple"], not: [] },
  playlist: { must: ["playlist"], not: ["id", "uri", "position"] },
};

export function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  const result: Partial<Record<Field, string>> = {};
  const used = new Set<string>();

  for (const field of Object.keys(ALIASES) as Field[]) {
    for (const alias of ALIASES[field]) {
      const hit = norm.find((h) => h.n === alias && !used.has(h.raw));
      if (hit) {
        result[field] = hit.raw;
        used.add(hit.raw);
        break;
      }
    }
  }
  for (const field of Object.keys(FUZZY) as Field[]) {
    if (result[field]) continue;
    const { must, not } = FUZZY[field];
    const hit = norm.find(
      (h) => !used.has(h.raw) && must.some((m) => h.n.includes(m)) && !not.some((x) => h.n.includes(x)),
    );
    if (hit) {
      result[field] = hit.raw;
      used.add(hit.raw);
    }
  }
  // "Duration (ms)" puede caer en durationSec por la búsqueda aproximada; ms gana.
  if (result.durationMs && result.durationSec === result.durationMs) delete result.durationSec;
  return result;
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/** Acepta "245", "245.3", "4:05" o "1:02:03". Devuelve segundos enteros. */
export function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (v.includes(":")) {
    const parts = v.split(":").map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return null;
    return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0));
  }
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function parseDurationMs(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n / 1000) : null;
}

/**
 * Separa artistas. Exportify usa comas; otros exportadores (TuneMyMusic, Soundiiz) unen el
 * último con " & ". Con `ampersand` también se parte por " & " (puede partir un nombre como
 * "Simon & Garfunkel", por eso la búsqueda de letras reintenta con el nombre completo).
 */
export function splitArtists(value: string, ampersand = false): string[] {
  return value
    .split(ampersand ? /\s*[,;]\s*|\s+&\s+/ : /\s*[,;]\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function cleanUri(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^spotify:track:[A-Za-z0-9]+$/.test(v)) return v;
  const m = v.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
  if (m) return `spotify:track:${m[1]}`;
  return undefined; // p. ej. spotify:local:... no tiene link
}

// ---------------------------------------------------------------------------
// Parser principal
// ---------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? "";
  const counts: Record<string, number> = {
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
  };
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ",";
}

export function parsePlaylistFile(input: Uint8Array | string): ParsedPlaylist {
  const { text, encoding } =
    typeof input === "string" ? { text: input.replace(/^﻿/, ""), encoding: "utf-8" } : decodeBuffer(input);

  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: "greedy",
    // Apple Music no usa comillas; así evitamos que un título con " rompa la fila.
    quoteChar: delimiter === "\t" ? "\u0000" : '"',
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const map = mapHeaders(headers);
  if (!map.title) {
    throw new Error(
      `No encontré una columna de título. Encabezados detectados: ${headers.slice(0, 12).join(", ") || "(ninguno)"}`,
    );
  }

  const normHeaders = new Set(headers.map(normalizeHeader));
  const source: PlaylistSource =
    map.uri || normHeaders.has("durationms") || normHeaders.has("artistnames")
      ? "spotify"
      : delimiter === "\t"
        ? "apple"
        : "csv";

  const tracks: ParsedTrack[] = [];
  let skipped = 0;
  for (const row of parsed.data) {
    const title = row[map.title]?.trim();
    if (!title) {
      skipped++;
      continue;
    }
    const artistRaw = (map.artist ? row[map.artist] : "")?.trim() ?? "";
    const artists = source === "apple" ? (artistRaw ? [artistRaw] : []) : splitArtists(artistRaw, source === "csv");
    const durationSec = map.durationMs
      ? parseDurationMs(row[map.durationMs])
      : map.durationSec
        ? parseDurationSeconds(row[map.durationSec])
        : null;

    const track: ParsedTrack = {
      title,
      artist: artists.join(", "),
      primaryArtist: artists[0] ?? "",
      album: (map.album ? row[map.album]?.trim() : "") || null,
      durationSec,
      source,
    };
    const uri = map.uri ? cleanUri(row[map.uri]) : undefined;
    if (uri) track.spotifyUri = uri;
    const isrc = map.isrc ? row[map.isrc]?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    if (isrc && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) track.isrc = isrc;
    const appleId = map.appleId ? row[map.appleId]?.trim() : "";
    if (appleId && /^\d+$/.test(appleId)) track.appleId = appleId;
    tracks.push(track);
  }

  const playlistName = map.playlist ? parsed.data.map((r) => r[map.playlist!]?.trim()).find(Boolean) : undefined;
  return { source, encoding, delimiter, tracks, skipped, ...(playlistName ? { playlistName } : {}) };
}
