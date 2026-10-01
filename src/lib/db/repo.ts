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
  isrc: string | null;
  apple_id: string | null;
  spotify_status: "matched" | "not_found" | null;
  spotify_matched_via: "export" | "isrc" | "search" | null;
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
}

/** Estados que todavía vale la pena consultar en LRCLIB. */
export const FETCHABLE: TrackStatus[] = ["pending", "error", "not_found"];

export function dedupeKey(t: Pick<ParsedTrack, "title" | "primaryArtist">): string {
  return `${normalizeForCompare(t.title)}|${normalizeForCompare(t.primaryArtist)}`;
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

export function importPlaylist(db: DB, name: string, parsed: ParsedPlaylist): { playlistId: number; trackCount: number } {
  const insertPlaylist = db.prepare("INSERT INTO playlists (name, source) VALUES (?, ?)");
  const byIsrc = db.prepare("SELECT id FROM tracks WHERE isrc = ? LIMIT 1");
  const byKey = db.prepare("SELECT id FROM tracks WHERE dedupe_key = ?");
  const byTitle = db.prepare("SELECT id, dedupe_key FROM tracks WHERE dedupe_key >= ? AND dedupe_key < ?");
  // Clave antigua: título + artista completo tal como venía ("A, B & C"). Se compara sin separadores.
  const looseArtist = (a: string) => normalizeForCompare(a).replace(/\band\b/g, " ").replace(/\s+/g, " ").trim();
  const byLegacyKey = (t: ParsedTrack) => {
    const prefix = `${normalizeForCompare(t.title)}|`;
    const wanted = looseArtist(t.artist);
    const rows = byTitle.all(prefix, prefix + "\uffff") as { id: number; dedupe_key: string }[];
    return rows.find((r) => looseArtist(r.dedupe_key.slice(prefix.length)) === wanted);
  };
  const insertTrack = db.prepare(`
    INSERT INTO tracks (dedupe_key, title, artist, primary_artist, album, duration_sec, spotify_uri,
                        spotify_status, spotify_matched_via, isrc, apple_id)
    VALUES (@key, @title, @artist, @primaryArtist, @album, @durationSec, @spotifyUri,
            CASE WHEN @spotifyUri IS NULL THEN NULL ELSE 'matched' END,
            CASE WHEN @spotifyUri IS NULL THEN NULL ELSE 'export' END, @isrc, @appleId)
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
      apple_id            = COALESCE(apple_id, @appleId)
    WHERE id = @id
  `);
  const link = db.prepare("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)");

  return db.transaction(() => {
    const playlistId = Number(insertPlaylist.run(name, parsed.source).lastInsertRowid);
    parsed.tracks.forEach((t, position) => {
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
      };
      // 1) misma grabación (ISRC)  2) mismo título + primer artista
      // 3) clave antigua: título + artista completo (canciones importadas antes de separar "A & B")
      const existing = ((t.isrc && byIsrc.get(t.isrc)) ||
        byKey.get(params.key) ||
        (t.artist !== t.primaryArtist && byLegacyKey(t))) as { id: number } | undefined;

      let id: number;
      if (existing) {
        id = existing.id;
        fillTrack.run({ ...params, id });
      } else {
        id = (insertTrack.get(params) as { id: number }).id;
      }
      link.run(playlistId, id, position);
    });
    return { playlistId, trackCount: parsed.tracks.length };
  })();
}

// ---------------------------------------------------------------------------
// Letras
// ---------------------------------------------------------------------------

function replaceLines(db: DB, trackId: number, lines: LyricLine[]) {
  db.prepare("DELETE FROM lyric_lines WHERE track_id = ?").run(trackId);
  db.prepare("DELETE FROM lyric_chunks WHERE track_id = ?").run(trackId);
  const insLine = db.prepare("INSERT INTO lyric_lines (track_id, line_index, time_ms, text) VALUES (?, ?, ?, ?)");
  lines.forEach((l, i) => insLine.run(trackId, i, l.timeMs, l.text));
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
         synced_lyrics_raw = ?, lyrics_error = NULL, lyrics_updated_at = datetime('now')
       WHERE id = ?`,
    ).run(status, plain ? "manual" : null, plain, synced, trackId);
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
       WHERE pt.playlist_id = ? AND t.lyrics_status IN (${FETCHABLE.map(() => "?").join(",")})
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
  COALESCE(SUM(t.lyrics_status = 'not_found'), 0)    AS not_found,
  COALESCE(SUM(t.lyrics_status = 'error'), 0)        AS error,
  COALESCE(SUM(t.lyrics_status = 'pending'), 0)      AS pending,
  COALESCE(SUM(t.spotify_status = 'matched'), 0)     AS spotify_matched,
  COALESCE(SUM(t.spotify_status = 'not_found'), 0)   AS spotify_not_found`;

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

export function getPlaylistTracks(db: DB, playlistId: number): (TrackRow & { position: number })[] {
  return db
    .prepare(
      `SELECT t.*, pt.position FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position`,
    )
    .all(playlistId) as (TrackRow & { position: number })[];
}

export function listTracksWithoutLyrics(db: DB): TrackRow[] {
  return db
    .prepare("SELECT * FROM tracks WHERE lyrics_status IN ('not_found','error') ORDER BY artist, title")
    .all() as TrackRow[];
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
