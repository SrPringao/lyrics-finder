import type { DB } from "@/lib/db";
import { fetchPlaylistLyrics, isFetching } from "@/lib/import/fetcher";
import { isResolving, resolvePlaylist } from "@/lib/spotify/resolver";

/**
 * Procesa una playlist. Con `linkSpotify`, primero vincula cada canción con Spotify (por ISRC o
 * texto) y obtiene su duración, que ayuda a LRCLIB; luego descarga las letras que falten.
 * Vincular gasta el cupo diario de búsquedas de Spotify, por eso solo se hace cuando se pide.
 */
export async function processPlaylist(db: DB, playlistId: number, opts: { linkSpotify?: boolean } = {}): Promise<void> {
  if (opts.linkSpotify) {
    try {
      await resolvePlaylist(db, playlistId);
    } catch (err) {
      console.error("[spotify]", err);
    }
  }
  await fetchPlaylistLyrics(db, playlistId);
}

export function startProcessing(db: DB, playlistId: number, opts: { linkSpotify?: boolean } = {}): void {
  void processPlaylist(db, playlistId, opts).catch((err) => console.error("[importación]", err));
}

export function processingPhase(playlistId: number): "spotify" | "lyrics" | null {
  if (isResolving(playlistId)) return "spotify";
  if (isFetching(playlistId)) return "lyrics";
  return null;
}
