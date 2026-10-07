import { getDb } from "@/lib/db";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { getAlbumEntries } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/** Un álbum por dentro: sus canciones, para elegir cuáles agregar. */
export async function GET(_req: Request, ctx: RouteContext<"/api/spotify/albums/[id]">) {
  const id = (await ctx.params).id;
  if (!/^[A-Za-z0-9]+$/.test(id)) return Response.json({ error: "Álbum no válido." }, { status: 400 });
  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta tu cuenta de Spotify primero." }, { status: 401 });
  try {
    const album = await getAlbumEntries(db, id);
    return Response.json({
      id: album.id,
      name: album.name,
      artists: album.artists,
      year: album.year,
      coverUrl: album.coverUrl,
      tracks: album.entries
        .map((e) => e.item ?? e.track)
        .filter((t): t is NonNullable<typeof t> => !!t && !!t.id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          artists: t.artists.map((a) => a.name).join(", "),
          durationMs: t.duration_ms,
          trackNumber: (t as { track_number?: number }).track_number ?? null,
          discNumber: (t as { disc_number?: number }).disc_number ?? 1,
          playable: t.is_playable !== false,
        })),
    });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
