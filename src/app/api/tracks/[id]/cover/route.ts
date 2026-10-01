import { getDb } from "@/lib/db";
import { getTrack, setCoverIfMissing } from "@/lib/db/repo";
import { isSpotifyImageUrl } from "@/lib/spotify/api";

/**
 * Guarda la portada que reporta el reproductor de Spotify al sonar la canción.
 * Así las canciones vinculadas antes de guardar portadas la obtienen sin gastar cupo de búsquedas.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/tracks/[id]/cover">) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  if (!isSpotifyImageUrl(url)) return Response.json({ error: "URL de portada no válida." }, { status: 400 });
  const db = getDb();
  if (!getTrack(db, id)) return Response.json({ error: "Canción no encontrada." }, { status: 404 });
  return Response.json({ saved: setCoverIfMissing(db, id, url) });
}
