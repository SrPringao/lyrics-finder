import { getDb } from "@/lib/db";
import { getPlaylistSummary } from "@/lib/db/repo";
import { startProcessing } from "@/lib/import/pipeline";
import { getSearchBlockedUntil, quotaMessage } from "@/lib/spotify/api";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/** Vuelve a intentar vincular con Spotify las canciones que no se encontraron. */
export async function POST(_req: Request, ctx: RouteContext<"/api/playlists/[id]/spotify">) {
  const id = Number((await ctx.params).id);
  const db = getDb();
  if (!getPlaylistSummary(db, id)) return Response.json({ error: "Playlist no encontrada." }, { status: 404 });
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta Spotify primero." }, { status: 401 });
  const blocked = getSearchBlockedUntil(db);
  if (blocked) return Response.json({ error: quotaMessage(blocked) }, { status: 429 });
  db.prepare(
    `UPDATE tracks SET spotify_status = NULL
     WHERE spotify_status = 'not_found' AND id IN (SELECT track_id FROM playlist_tracks WHERE playlist_id = ?)`,
  ).run(id);
  startProcessing(db, id, { linkSpotify: true });
  return Response.json({ ok: true });
}
