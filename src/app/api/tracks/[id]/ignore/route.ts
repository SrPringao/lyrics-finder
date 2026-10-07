import { getDb } from "@/lib/db";
import { setLyricsIgnored } from "@/lib/db/repo";

/** Oculta una canción que nunca tendrá letra (o la vuelve a mostrar). */
export async function PUT(req: Request, ctx: RouteContext<"/api/tracks/[id]/ignore">) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => null)) as { ignored?: unknown } | null;
  if (typeof body?.ignored !== "boolean") return Response.json({ error: "Falta ignored." }, { status: 400 });
  if (!setLyricsIgnored(getDb(), id, body.ignored)) return Response.json({ error: "Canción no encontrada." }, { status: 404 });
  return Response.json({ ok: true, ignored: body.ignored });
}
