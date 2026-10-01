import { getDb } from "@/lib/db";
import { getTrack, saveManualLyrics } from "@/lib/db/repo";

export async function PUT(req: Request, ctx: RouteContext<"/api/tracks/[id]/lyrics">) {
  const id = Number((await ctx.params).id);
  const db = getDb();
  if (!getTrack(db, id)) return Response.json({ error: "Canción no encontrada." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (typeof body?.text !== "string") return Response.json({ error: "Falta el texto." }, { status: 400 });
  const status = saveManualLyrics(db, id, body.text);
  return Response.json({ status });
}
