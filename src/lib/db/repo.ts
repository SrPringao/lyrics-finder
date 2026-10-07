import type { DB } from "@/lib/db";
import type { LyricsResult } from "@/lib/lrclib/client";
import { normalizeForCompare } from "@/lib/lrclib/client";
import { looksLikeLrc, parseLrc, parsePlain, lrcToPlain, type LyricLine } from "@/lib/parsers/lrc";
import type { ParsedPlaylist, ParsedTrack } from "@/lib/parsers/playlist";
import { chunkLines } from "@/lib/semantic/chunks";

export type TrackStatus = "pending" | "synced" | "plain" | "instrumental" | "not_found" | "error";

export interface TrackRow {
  id: number;
  title: string;
  artist: string;
  primary_artist: string;
  album: string | null;
  duration_sec: number | null;
  spotify_uri: string | null;
  lyrics_status: TrackStatus;
  lyrics_source: "lrclib" | "manual" | null;
  plain_lyrics: string | null;
  synced_lyrics_raw: string | null;
  lyrics_error: string | null;
  /** 1 = el usuario la ocultó (sabe que no tiene letra): no se reintenta ni aparece en "sin letra". */
  lyrics_ignored: number;
  isrc: string | null;
  apple_id: string | null;
  spotify_status: "matched" | "not_found" | null;
  spotify_matched_via: "export" | "isrc" | "search" | null;
  cover_url: string | null;
}

export interface LineRow {
  id: number;
  line_index: number;
  time_ms: number | null;
  text: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  source: string;
  created_at: string;
  total: number;
  synced: number;
  plain: number;
  instrumental: number;
  not_found: number;
  error: number;
  pending: number;
  spotify_matched: number;
  spotify_not_found: number;
  cover_url: string | null;
  /** Canciones ocultadas por no tener letra. */
  ignored: number;
}

/** Estados que todavía vale la pena consultar en LRCLIB. */
export const FETCHABLE: TrackStatus[] = ["pending", "error", "not_found"];

export function dedupeKey(t: Pick<ParsedTrack, "title" | "primaryArtist">): string {
  return `${normalizeForCompare(t.title)}|${normalizeForCompare(t.primaryArtist)}`;
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

/**
 * Devuelve una función que guarda una canción (o completa la que ya existía) y regresa su id.
 * Busca primero por ISRC, luego por título + primer artista y, por último, por la clave
 * antigua (título + artista completo, de antes de separar "A & B").
 */
function trackUpserter(db: DB): (t: ParsedTrack) => number {
  const byIsrc = db.prepare("SELECT id FROM tracks WHERE isrc = ? LIMIT 1");
  const byUri = db.prepare("SELECT id FROM tracks WHERE spotify_uri = ? LIMIT 1");
  const byKey = db.prepare("SELECT id FROM tracks WHERE dedupe_key = ?");
  const byTitle = db.prepare("SELECT id, dedupe_key FROM tracks WHERE dedupe_key >= ? AND dedupe_key < ?");
  const looseArtist = (a: string) => normalizeForCompare(a).replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();
  const byLegacyKey = (t: ParsedTrack) => {
    const prefix = `${normalizeForCompare(t.title)}|`;
    const wanted = looseArtist(t.artist);
    const rows = byTitle.all(prefix, prefix + "\uffff") as { id: number; dedupe_key: string }[];
    return rows.find((r) => looseArtist(r.dedupe_key.slice(prefix.length)) === wanted);
  };
  const insertTrack = db.prepare(`
    INSERT INTO tracks (dedupe_key, title, artist, primary_artist, album, duration_sec, spotify_uri,
                        spotify_status, spotify_matched_via, isrc, apple_id, cover_url)
    VALUES (@key, @title, @artist, @primaryArtist, @album, @durationSec, @spotifyUri,
            CASE WHEN @spotifyUri IS NULL THEN NULL ELSE 'matched' END,
            CASE WHEN @spotifyUri IS NULL THEN NULL ELSE 'export' END, @isrc, @appleId, @coverUrl)
    RETURNING id
  `);
  // Completa datos que falten sin pisar los que ya había.
  const fillTrack = db.prepare(`
    UPDATE tracks SET
      spotify_uri         = COALESCE(spotify_uri, @spotifyUri),
      spotify_status      = CASE WHEN spotify_uri IS NULL AND @spotifyUri IS NOT NULL THEN 'matched' ELSE spotify_status END,
      spotify_matched_via = CASE WHEN spotify_uri IS NULL AND @spotifyUri IS NOT NULL THEN 'export' ELSE spotify_matched_via END,
      album               = COALESCE(album, @album),
      duration_sec        = COALESCE(duration_sec, @durationSec),
      isrc                = COALESCE(isrc, @isrc),
      apple_id            = COALESCE(apple_id, @appleId),
      cover_url           = COALESCE(cover_url, @coverUrl)
    WHERE id = @id
  `);

  return (t) => {
    const params = {
      key: dedupeKey(t),
      title: t.title,
      artist: t.artist,
      primaryArtist: t.primaryArtist,
      album: t.album,
      durationSec: t.durationSec,
      spotifyUri: t.spotifyUri ?? null,
      isrc: t.isrc ?? null,
      appleId: t.appleId ?? null,
      coverUrl: t.coverUrl ?? null,
    };
    const existing = ((t.isrc && byIsrc.get(t.isrc)) ||
      (t.spotifyUri && byUri.get(t.spotifyUri)) ||
      byKey.get(params.key) ||
      (t.artist !== t.primaryArtist && byLegacyKey(t))) as { id: number } | undefined;
    if (existing) {
      fillTrack.run({ ...params, id: existing.id });
      return existing.id;
    }
    return (insertTrack.get(params) as { id: number }).id;
  };
}

export function importPlaylist(db: DB, name: string, parsed: ParsedPlaylist): { playlistId: number; trackCount: number } {
  const insertPlaylist = db.prepare("INSERT INTO playlists (name, source) VALUES (?, ?)");
  const link = db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)");
  const upsert = trackUpserter(db);
  return db.transaction(() => {
    const playlistId = Number(insertPlaylist.run(name, parsed.source).lastInsertRowid);
    parsed.tracks.forEach((t, position) => link.run(playlistId, upsert(t), position));
    return { playlistId, trackCount: parsed.tracks.length };
  })();
}

/** Lista donde caen las canciones y álbumes agregados desde la búsqueda de Spotify. */
export const ADDED_PLAYLIST_NAME = "Agregadas desde Spotify";

export function getOrCreatePlaylist(db: DB, name: string, source: string): number {
  const row = db.prepare("SELECT id FROM playlists WHERE name = ? AND source = ? ORDER BY id LIMIT 1").get(name, source) as
    | { id: number }
    | undefined;
  if (row) return row.id;
  return Number(db.prepare("INSERT INTO playlists (name, source) VALUES (?, ?)").run(name, source).lastInsertRowid);
}

/** Agrega canciones al final de una playlist existente; las que ya estaban en ella no se repiten. */
export function addTracksToPlaylist(db: DB, playlistId: number, parsed: ParsedPlaylist): { added: number; already: number } {
  const inPlaylist = db.prepare("SELECT 1 FROM playlist_tracks WHERE playlist_id = ? AND track_id = ? LIMIT 1");
  const maxPos = db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?");
  const link = db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)");
  const upsert = trackUpserter(db);
  return db.transaction(() => {
    let position = (maxPos.get(playlistId) as { m: number }).m + 1;
    let added = 0;
    let already = 0;
    for (const t of parsed.tracks) {
      const id = upsert(t);
      if (inPlaylist.get(playlistId, id)) {
        already++;
        continue;
      }
      link.run(playlistId, id, position++);
      added++;
    }
    return { added, already };
  })();
}

// ---------------------------------------------------------------------------
// Letras
// ---------------------------------------------------------------------------

function replaceLines(db: DB, trackId: number, lines: LyricLine[]) {
  db.prepare("DELETE FROM lyric_lines WHERE track_id = ?").run(trackId);
  db.prepare("DELETE FROM lyric_chunks WHERE track_id = ?").run(trackId);
  const insLine = db.prepare("INSERT INTO lyric_lines (track_id, line_index, time_ms, text) VALUES (?, ?, ?, ?)");
  // NFC para que la ñ sea un solo carácter (los índices de búsqueda dependen de eso).
  lines.forEach((l, i) => insLine.run(trackId, i, l.timeMs, l.text.normalize("NFC")));
  const insChunk = db.prepare(
    "INSERT INTO lyric_chunks (track_id, chunk_index, start_line, end_line, start_ms, text) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const c of chunkLines(lines)) insChunk.run(trackId, c.chunkIndex, c.startLine, c.endLine, c.startMs, c.text);
}

/** Guarda el resultado de LRCLIB y reconstruye líneas + índice. */
export function saveLyricsResult(db: DB, trackId: number, r: LyricsResult): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE tracks SET lyrics_status = ?, lyrics_source = ?, lrclib_id = ?, plain_lyrics = ?,
         synced_lyrics_raw = ?, lyrics_error = NULL, lyrics_updated_at = datetime('now')
       WHERE id = ?`,
    ).run(r.status, r.status === "not_found" ? null : "lrclib", r.lrclibId, r.plainLyrics, r.syncedLyrics, trackId);
    const lines = r.syncedLyrics ? parseLrc(r.syncedLyrics) : r.plainLyrics ? parsePlain(r.plainLyrics) : [];
    replaceLines(db, trackId, lines);
  })();
}

/** Letra pegada a mano. Si viene en formato LRC se guarda como sincronizada. Texto vacío = borrar. */
export function saveManualLyrics(db: DB, trackId: number, text: string): TrackStatus {
  const trimmed = text.trim();
  const synced = looksLikeLrc(trimmed) ? trimmed : null;
  const plain = synced ? lrcToPlain(synced) : trimmed || null;
  const status: TrackStatus = synced ? "synced" : plain ? "plain" : "not_found";
  db.transaction(() => {
    db.prepare(
      `UPDATE tracks SET lyrics_status = ?, lyrics_source = ?, lrclib_id = NULL, plain_lyrics = ?,
         synced_lyrics_raw = ?, lyrics_error = NULL, lyrics_updated_at = datetime('now'),
         -- Si ahora tiene letra, deja de estar oculta.
         lyrics_ignored = CASE WHEN ? IS NOT NULL THEN 0 ELSE lyrics_ignored END
       WHERE id = ?`,
    ).run(status, plain ? "manual" : null, plain, synced, plain, trackId);
    replaceLines(db, trackId, synced ? parseLrc(synced) : plain ? parsePlain(plain) : []);
  })();
  return status;
}

export function markError(db: DB, trackId: number, message: string): void {
  db.prepare("UPDATE tracks SET lyrics_status = 'error', lyrics_error = ? WHERE id = ?").run(message.slice(0, 500), trackId);
}

/** Canciones de la playlist que hay que (re)consultar. Las que ya tienen letra se saltan (caché). */
export function tracksToFetch(db: DB, playlistId: number): TrackRow[] {
  return db
    .prepare(
      `SELECT DISTINCT t.* FROM tracks t JOIN playlist_tracks pt ON pt.track_id = t.id
       WHERE pt.playlist_id = ? AND t.lyrics_ignored = 0
         AND t.lyrics_status IN (${FETCHABLE.map(() => "?").join(",")})
       ORDER BY pt.position`,
    )
    .all(playlistId, ...FETCHABLE) as TrackRow[];
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

const SUMMARY_COLUMNS = `
  p.id, p.name, p.source, p.created_at,
  COUNT(t.id) AS total,
  COALESCE(SUM(t.lyrics_status = 'synced'), 0)       AS synced,
  COALESCE(SUM(t.lyrics_status = 'plain'), 0)        AS plain,
  COALESCE(SUM(t.lyrics_status = 'instrumental'), 0) AS instrumental,
  COALESCE(SUM(t.lyrics_status = 'not_found' AND t.lyrics_ignored = 0), 0) AS not_found,
  COALESCE(SUM(t.lyrics_status = 'error' AND t.lyrics_ignored = 0), 0)     AS error,
  COALESCE(SUM(t.lyrics_ignored = 1), 0)                                   AS ignored,
  COALESCE(SUM(t.lyrics_status = 'pending'), 0)      AS pending,
  COALESCE(SUM(t.spotify_status = 'matched'), 0)     AS spotify_matched,
  COALESCE(SUM(t.spotify_status = 'not_found'), 0)   AS spotify_not_found,
  (SELECT t2.cover_url FROM playlist_tracks pt2 JOIN tracks t2 ON t2.id = pt2.track_id
   WHERE pt2.playlist_id = p.id AND t2.cover_url IS NOT NULL ORDER BY pt2.position LIMIT 1) AS cover_url`;

// Una canción repetida en la misma playlist se cuenta una vez.
const SUMMARY_FROM = `
  FROM playlists p
  LEFT JOIN (SELECT DISTINCT playlist_id, track_id FROM playlist_tracks) pt ON pt.playlist_id = p.id
  LEFT JOIN tracks t ON t.id = pt.track_id`;

export function getPlaylistSummary(db: DB, playlistId: number): PlaylistSummary | undefined {
  return db.prepare(`SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} WHERE p.id = ? GROUP BY p.id`).get(playlistId) as
    | PlaylistSummary
    | undefined;
}

export function listPlaylists(db: DB): PlaylistSummary[] {
  return db.prepare(`SELECT ${SUMMARY_COLUMNS} ${SUMMARY_FROM} GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`).all() as PlaylistSummary[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export function pageParams(raw: unknown, perPage: number, total: number): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const n = Math.floor(Number(raw));
  const page = Number.isFinite(n) ? Math.min(Math.max(1, n), pages) : 1;
  return { page, pages, offset: (page - 1) * perPage };
}

export function getPlaylistTracks(db: DB, playlistId: number): (TrackRow & { position: number })[];
export function getPlaylistTracks(db: DB, playlistId: number, page: unknown, perPage: number): Page<TrackRow & { position: number }>;
export function getPlaylistTracks(db: DB, playlistId: number, page?: unknown, perPage?: number) {
  const sql = `SELECT t.*, pt.position FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
               WHERE pt.playlist_id = ? ORDER BY pt.position`;
  if (perPage === undefined) return db.prepare(sql).all(playlistId) as (TrackRow & { position: number })[];
  const total = (db.prepare("SELECT COUNT(*) c FROM playlist_tracks WHERE playlist_id = ?").get(playlistId) as { c: number }).c;
  const p = pageParams(page, perPage, total);
  const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(playlistId, perPage, p.offset) as (TrackRow & { position: number })[];
  return { items, total, page: p.page, pages: p.pages };
}

const WITHOUT_LYRICS = "lyrics_status IN ('not_found','error') AND lyrics_ignored = 0";

/** Oculta (o vuelve a mostrar) una canción que nunca tendrá letra. */
export function setLyricsIgnored(db: DB, trackId: number, ignored: boolean): boolean {
  return db.prepare("UPDATE tracks SET lyrics_ignored = ? WHERE id = ?").run(ignored ? 1 : 0, trackId).changes > 0;
}

export function listIgnoredTracks(db: DB): TrackRow[] {
  return db.prepare("SELECT * FROM tracks WHERE lyrics_ignored = 1 ORDER BY artist, title").all() as TrackRow[];
}

export function listTracksWithoutLyrics(db: DB): TrackRow[];
export function listTracksWithoutLyrics(db: DB, page: unknown, perPage: number): Page<TrackRow>;
export function listTracksWithoutLyrics(db: DB, page?: unknown, perPage?: number) {
  const sql = `SELECT * FROM tracks WHERE ${WITHOUT_LYRICS} ORDER BY artist, title`;
  if (perPage === undefined) return db.prepare(sql).all() as TrackRow[];
  const total = (db.prepare(`SELECT COUNT(*) c FROM tracks WHERE ${WITHOUT_LYRICS}`).get() as { c: number }).c;
  const p = pageParams(page, perPage, total);
  const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(perPage, p.offset) as TrackRow[];
  return { items, total, page: p.page, pages: p.pages };
}

/** Lo que necesita el panel "Ahora suena" de una canción. */
export interface TrackPayload {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number | null;
  spotifyUri: string | null;
  coverUrl: string | null;
  lyricsStatus: TrackStatus;
  lines: { i: number; t: number | null; text: string }[];
}

export function getTrackPayload(db: DB, id: number): TrackPayload | null {
  const t = getTrack(db, id);
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    durationMs: t.duration_sec != null ? t.duration_sec * 1000 : null,
    spotifyUri: t.spotify_uri,
    coverUrl: t.cover_url,
    lyricsStatus: t.lyrics_status,
    lines: getTrackLines(db, id).map((l) => ({ i: l.line_index, t: l.time_ms, text: l.text })),
  };
}

export function findTrackIdByUri(db: DB, uris: string[]): number | null {
  for (const uri of uris) {
    const row = db.prepare("SELECT id FROM tracks WHERE spotify_uri = ? LIMIT 1").get(uri) as { id: number } | undefined;
    if (row) return row.id;
  }
  return null;
}

/** Guarda la portada si aún no hay una. */
export function setCoverIfMissing(db: DB, trackId: number, url: string): boolean {
  return db.prepare("UPDATE tracks SET cover_url = ? WHERE id = ? AND cover_url IS NULL").run(url, trackId).changes > 0;
}

export function getTrack(db: DB, id: number): TrackRow | undefined {
  return db.prepare("SELECT * FROM tracks WHERE id = ?").get(id) as TrackRow | undefined;
}

export function getTrackLines(db: DB, trackId: number): LineRow[] {
  return db
    .prepare("SELECT id, line_index, time_ms, text FROM lyric_lines WHERE track_id = ? ORDER BY line_index")
    .all(trackId) as LineRow[];
}

export function getTrackPlaylists(db: DB, trackId: number): { id: number; name: string }[] {
  return db
    .prepare(
      `SELECT DISTINCT p.id, p.name FROM playlists p JOIN playlist_tracks pt ON pt.playlist_id = p.id
       WHERE pt.track_id = ? ORDER BY p.name`,
    )
    .all(trackId) as { id: number; name: string }[];
}

/** Borra la playlist y las canciones que ya no estén en ninguna otra. */
export function deletePlaylist(db: DB, playlistId: number): void {
  db.transaction(() => {
    db.prepare("DELETE FROM playlists WHERE id = ?").run(playlistId);
    db.prepare("DELETE FROM tracks WHERE id NOT IN (SELECT track_id FROM playlist_tracks)").run();
  })();
}
