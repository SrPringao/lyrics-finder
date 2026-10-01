import { getDb } from "@/lib/db";
import { deletePlaylist, getPlaylistSummary } from "@/lib/db/repo";
import { processingPhase } from "@/lib/import/pipeline";

export async function GET(_req: Request, ctx: RouteContext<"/api/playlists/[id]">) {
  const id = Number((await ctx.params).id);
  const summary = getPlaylistSummary(getDb(), id);
  if (!summary) return Response.json({ error: "Playlist no encontrada." }, { status: 404 });
  const phase = processingPhase(id);
  return Response.json({ ...summary, running: phase !== null, phase });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/playlists/[id]">) {
  const id = Number((await ctx.params).id);
  if (processingPhase(id)) return Response.json({ error: "Espera a que termine la descarga de letras." }, { status: 409 });
  deletePlaylist(getDb(), id);
  return Response.json({ ok: true });
}
