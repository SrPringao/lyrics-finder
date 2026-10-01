import type { DB } from "@/lib/db";
import { getTrack, type TrackRow } from "@/lib/db/repo";
import { Limiter } from "@/lib/lrclib/limiter";
import {
  getSearchBlockedUntil,
  searchByIsrc,
  searchByText,
  SpotifyApiError,
  type ApiOptions,
  pickCover,
  type SpotifyTrack,
} from "@/lib/spotify/api";
import { getAuth, SpotifyNotConnectedError } from "@/lib/spotify/auth";

// Claves "V2": las versiones anteriores podían quedar dormidas esperando un Retry-After de horas.
const g = globalThis as unknown as { __spotifyLimiterV2?: Limiter; __spotifyResolvingV2?: Set<number> };
export const spotifyLimiter = (g.__spotifyLimiterV2 ??= new Limiter(2));
const resolving = (g.__spotifyResolvingV2 ??= new Set<number>());

export function isResolving(playlistId: number): boolean {
  return resolving.has(playlistId);
}

export function isSpotifyConnected(db: DB): boolean {
  return !!getAuth(db);
}

function saveMatch(db: DB, trackId: number, t: SpotifyTrack, via: "isrc" | "search") {
  db.prepare(
    `UPDATE tracks SET spotify_uri = @uri, spotify_status = 'matched', spotify_matched_via = @via,
       duration_sec = COALESCE(duration_sec, @duration),
       cover_url = COALESCE(@cover, cover_url),
       isrc = COALESCE(isrc, @isrc),
       -- Con ISRC es la grabación exacta: el primer artista de Spotify es más confiable para buscar letras.
       primary_artist = CASE WHEN @via = 'isrc' THEN @primary ELSE primary_artist END
     WHERE id = @id`,
  ).run({
    id: trackId,
    uri: t.uri,
    via,
    duration: Math.round(t.duration_ms / 1000),
    isrc: t.external_ids?.isrc ?? null,
    primary: t.artists[0]?.name ?? null,
    cover: pickCover(t.album?.images),
  });
}

/** Busca una canción en Spotify y guarda su URI. Devuelve el URI o null. */
export async function resolveTrack(db: DB, track: TrackRow, opts: ApiOptions = {}): Promise<string | null> {
  if (track.spotify_uri) return track.spotify_uri;
  let match: SpotifyTrack | null = null;
  let via: "isrc" | "search" = "isrc";
  if (track.isrc) match = await searchByIsrc(db, track.isrc, opts);
  if (!match) {
    via = "search";
    const q = { title: track.title, durationSec: track.duration_sec };
    match = await searchByText(db, { ...q, artist: track.primary_artist }, opts);
    if (!match && track.artist && track.artist !== track.primary_artist) match = await searchByText(db, { ...q, artist: track.artist }, opts);
  }
  if (match) {
    saveMatch(db, track.id, match, via);
    return match.uri;
  }
  db.prepare("UPDATE tracks SET spotify_status = 'not_found' WHERE id = ?").run(track.id);
  return null;
}

/**
 * Vincula con Spotify las canciones de una playlist que aún no tienen URI. Cada canción gasta
 * una o dos búsquedas del cupo diario, así que solo se lanza a mano (botón en la Biblioteca);
 * al reproducir, las canciones se vinculan una por una.
 */
export async function resolvePlaylist(db: DB, playlistId: number, opts: ApiOptions & { limiter?: Limiter } = {}): Promise<void> {
  if (resolving.has(playlistId) || !isSpotifyConnected(db) || getSearchBlockedUntil(db)) return;
  resolving.add(playlistId);
  const limiter = opts.limiter ?? spotifyLimiter;
  try {
    const tracks = db
      .prepare(
        `SELECT DISTINCT t.* FROM tracks t JOIN playlist_tracks pt ON pt.track_id = t.id
         WHERE pt.playlist_id = ? AND t.spotify_uri IS NULL AND t.spotify_status IS NULL ORDER BY pt.position`,
      )
      .all(playlistId) as TrackRow[];
    let abort = false;
    await Promise.all(
      tracks.map((t) =>
        limiter.run(async () => {
          if (abort) return;
          const fresh = getTrack(db, t.id);
          if (!fresh || fresh.spotify_uri || fresh.spotify_status) return;
          try {
            await resolveTrack(db, fresh, opts);
          } catch (err) {
            // Sin sesión, sin permiso o sin cupo no tiene caso seguir con las demás.
            if (err instanceof SpotifyNotConnectedError || (err instanceof SpotifyApiError && [401, 403, 429].includes(err.status))) abort = true;
            console.error("[spotify]", t.title, err instanceof Error ? err.message : err);
          }
        }),
      ),
    );
  } finally {
    resolving.delete(playlistId);
  }
}
