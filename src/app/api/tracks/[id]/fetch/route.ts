import { getDb } from "@/lib/db";
import { getTrack, markError, saveLyricsResult } from "@/lib/db/repo";
import { fetchLyricsForTrack } from "@/lib/import/fetcher";
import { lrclibLimiter } from "@/lib/lrclib/limiter";

/** Vuelve a buscar la letra de una sola canción en LRCLIB (reemplaza la actual si encuentra algo). */
export async function POST(_req: Request, ctx: RouteContext<"/api/tracks/[id]/fetch">) {
  const id = Number((await ctx.params).id);
  const db = getDb();
  const t = getTrack(db, id);
  if (!t) return Response.json({ error: "Canción no encontrada." }, { status: 404 });
  try {
    const r = await lrclibLimiter.run(() =>
      fetchLyricsForTrack(t),
    );
    // No borres una letra manual si LRCLIB no encontró nada.
    if (r.status === "not_found" && t.lyrics_source === "manual") return Response.json({ status: t.lyrics_status, kept: true });
    saveLyricsResult(db, id, r);
    return Response.json({ status: r.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (t.lyrics_source !== "manual") markError(db, id, message);
    return Response.json({ error: message }, { status: 502 });
  }
}
