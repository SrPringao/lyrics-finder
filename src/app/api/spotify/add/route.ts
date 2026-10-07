import { getDb } from "@/lib/db";
import { ADDED_PLAYLIST_NAME, addTracksToPlaylist, getOrCreatePlaylist, getPlaylistSummary } from "@/lib/db/repo";
import { startProcessing } from "@/lib/import/pipeline";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { entriesToParsed, getAlbumEntries, getTrackEntries } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/**
 * Agrega una canción o un álbum completo de Spotify a una playlist de la app (por defecto,
 * "Agregadas desde Spotify"). Llegan ya vinculadas; luego se descargan sus letras.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { kind?: unknown; id?: unknown; playlistId?: unknown; trackIds?: unknown } | null;
  const kind = body?.kind === "album" ? "album" : body?.kind === "track" ? "track" : null;
  const id = typeof body?.id === "string" && /^[A-Za-z0-9]+$/.test(body.id) ? body.id : null;
  if (!kind || !id) return Response.json({ error: "Solicitud no válida." }, { status: 400 });
  // Solo algunas canciones del álbum (elegidas a mano). Sin la lista, el álbum completo.
  const trackIds =
    kind === "album" && Array.isArray(body?.trackIds)
      ? new Set(body.trackIds.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9]+$/.test(x)))
      : null;
  if (trackIds && trackIds.size === 0) return Response.json({ error: "Elige al menos una canción." }, { status: 400 });

  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta tu cuenta de Spotify primero." }, { status: 401 });

  let playlistId: number;
  if (typeof body?.playlistId === "number") {
    if (!getPlaylistSummary(db, body.playlistId)) return Response.json({ error: "Playlist no encontrada." }, { status: 404 });
    playlistId = body.playlistId;
  } else {
    playlistId = getOrCreatePlaylist(db, ADDED_PLAYLIST_NAME, "spotify");
  }

  try {
    const { name, entries } =
      kind === "album" ? await getAlbumEntries(db, id) : { name: "", entries: await getTrackEntries(db, id) };
    const chosen = trackIds ? entries.filter((e) => trackIds.has((e.item ?? e.track)?.id ?? "")) : entries;
    const parsed = entriesToParsed(chosen, name);
    if (parsed.tracks.length === 0) return Response.json({ error: "No hay canciones que se puedan agregar." }, { status: 422 });
    const { added, already } = addTracksToPlaylist(db, playlistId, parsed);
    if (added > 0) startProcessing(db, playlistId);
    return Response.json({ playlistId, playlistName: getPlaylistSummary(db, playlistId)?.name ?? ADDED_PLAYLIST_NAME, added, already });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
