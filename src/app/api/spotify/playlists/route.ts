import { getDb } from "@/lib/db";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { countLikedTracks, hasLibraryScopes, listMyPlaylists } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/** Tus playlists de Spotify (y cuántas canciones hay en "Tus me gusta"). */
export async function GET() {
  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ connected: false, playlists: [] });
  // Sesiones anteriores no tienen permiso para leer playlists: hay que volver a conectar.
  if (!hasLibraryScopes(db)) return Response.json({ connected: true, needsReconnect: true, playlists: [] });
  try {
    const [playlists, liked] = await Promise.all([listMyPlaylists(db), countLikedTracks(db)]);
    return Response.json({ connected: true, needsReconnect: false, playlists, liked });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
