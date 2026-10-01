import type { DB } from "@/lib/db";
import { fetchLyrics, type ClientOptions, type LyricsResult } from "@/lib/lrclib/client";
import { lrclibLimiter, type Limiter } from "@/lib/lrclib/limiter";
import { FETCHABLE, getTrack, markError, saveLyricsResult, tracksToFetch, type TrackRow } from "@/lib/db/repo";

// Playlists cuya descarga está en curso (sobrevive al hot reload de `next dev`).
const g = globalThis as unknown as { __runningFetches?: Set<number> };
const running = (g.__runningFetches ??= new Set<number>());

/** Busca con el primer artista y, si no aparece, con el nombre completo ("Simon & Garfunkel"). */
export async function fetchLyricsForTrack(t: TrackRow, client?: ClientOptions): Promise<LyricsResult> {
  const q = { title: t.title, artist: t.primary_artist, album: t.album, durationSec: t.duration_sec };
  const result = await fetchLyrics(q, client);
  if (result.status !== "not_found" || !t.artist || t.artist === t.primary_artist) return result;
  return fetchLyrics({ ...q, artist: t.artist }, client);
}

export function isFetching(playlistId: number): boolean {
  return running.has(playlistId);
}

/**
 * Descarga las letras que falten de una playlist. Se lanza sin esperar (fire-and-forget)
 * desde la ruta de importación; el progreso se lee directamente de la base.
 */
export async function fetchPlaylistLyrics(
  db: DB,
  playlistId: number,
  opts: { limiter?: Limiter; client?: ClientOptions } = {},
): Promise<void> {
  if (running.has(playlistId)) return;
  running.add(playlistId);
  const limiter = opts.limiter ?? lrclibLimiter;
  try {
    const tracks = tracksToFetch(db, playlistId);
    await Promise.all(
      tracks.map((t) =>
        limiter.run(async () => {
          // Puede que otra playlist ya haya traído esta canción mientras esperaba turno.
          const fresh = getTrack(db, t.id);
          if (!fresh || !FETCHABLE.includes(fresh.lyrics_status)) return;
          try {
            saveLyricsResult(db, t.id, await fetchLyricsForTrack(fresh, opts.client));
          } catch (err) {
            markError(db, t.id, err instanceof Error ? err.message : String(err));
          }
        }),
      ),
    );
  } finally {
    running.delete(playlistId);
  }
}
