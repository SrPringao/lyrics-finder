import { getDb } from "@/lib/db";
import { importPlaylist } from "@/lib/db/repo";
import { startProcessing } from "@/lib/import/pipeline";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { entriesToParsed, getPlaylistName, getTracksOf, hasLibraryScopes } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/**
 * Importa una playlist directo de Spotify. Las canciones llegan ya vinculadas (URI, ISRC,
 * duración y portada), así que no se gastan búsquedas; luego se descargan las letras.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^(liked|[A-Za-z0-9]+)$/.test(id)) return Response.json({ error: "Playlist no válida." }, { status: 400 });

  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta tu cuenta de Spotify primero." }, { status: 401 });
  if (!hasLibraryScopes(db)) return Response.json({ error: "Vuelve a conectar Spotify para dar permiso de leer tus playlists.", code: "reconnect" }, { status: 403 });

  try {
    const [name, entries] = await Promise.all([getPlaylistName(db, id), getTracksOf(db, id)]);
    const parsed = entriesToParsed(entries, name);
    if (parsed.tracks.length === 0) return Response.json({ error: "Esta playlist no tiene canciones que se puedan importar." }, { status: 422 });
    const { playlistId, trackCount } = importPlaylist(db, name, parsed);
    startProcessing(db, playlistId);
    return Response.json({
      playlistId,
      name,
      trackCount,
      source: "spotify",
      encoding: "utf-8",
      skipped: parsed.skipped,
      withIsrc: parsed.tracks.filter((t) => t.isrc).length,
    });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
