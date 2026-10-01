import { getDb } from "@/lib/db";
import { getTrackPayload } from "@/lib/db/repo";

/** Datos de una canción para el panel "Ahora suena": metadatos, portada y letra con tiempos. */
export async function GET(_req: Request, ctx: RouteContext<"/api/tracks/[id]">) {
  const payload = getTrackPayload(getDb(), Number((await ctx.params).id));
  if (!payload) return Response.json({ error: "Canción no encontrada." }, { status: 404 });
  return Response.json(payload);
}
