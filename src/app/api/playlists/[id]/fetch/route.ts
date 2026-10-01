import { getDb } from "@/lib/db";
import { getPlaylistSummary } from "@/lib/db/repo";
import { startProcessing } from "@/lib/import/pipeline";

/** Reanuda / reintenta: vincula con Spotify lo que falte y vuelve a buscar letras pendientes, con error o no encontradas. */
export async function POST(_req: Request, ctx: RouteContext<"/api/playlists/[id]/fetch">) {
  const id = Number((await ctx.params).id);
  const db = getDb();
  if (!getPlaylistSummary(db, id)) return Response.json({ error: "Playlist no encontrada." }, { status: 404 });
  startProcessing(db, id);
  return Response.json({ ok: true });
}
