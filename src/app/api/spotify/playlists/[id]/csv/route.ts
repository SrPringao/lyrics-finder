import { getDb } from "@/lib/db";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { csvFileName, entriesToParsed, getPlaylistName, getTracksOf, hasLibraryScopes, toTuneMyMusicCsv } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/** Descarga una playlist de Spotify como CSV, con el mismo formato que TuneMyMusic. */
export async function GET(_req: Request, ctx: RouteContext<"/api/spotify/playlists/[id]/csv">) {
  const id = (await ctx.params).id;
  if (!/^(liked|[A-Za-z0-9]+)$/.test(id)) return Response.json({ error: "Playlist no válida." }, { status: 400 });
  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta tu cuenta de Spotify primero." }, { status: 401 });
  if (!hasLibraryScopes(db)) return Response.json({ error: "Vuelve a conectar Spotify para dar permiso de leer tus playlists." }, { status: 403 });
  try {
    const [name, entries] = await Promise.all([getPlaylistName(db, id), getTracksOf(db, id)]);
    const csv = toTuneMyMusicCsv(entriesToParsed(entries, name), name);
    const file = csvFileName(name);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        // filename* permite acentos en el nombre del archivo.
        "content-disposition": `attachment; filename="${file.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      },
    });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
