import { getDb } from "@/lib/db";
import { importPlaylist } from "@/lib/db/repo";
import { startProcessing } from "@/lib/import/pipeline";
import { parsePlaylistFile } from "@/lib/parsers/playlist";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Falta el archivo de la playlist." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parsePlaylistFile(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "No pude leer el archivo." }, { status: 422 });
  }
  if (parsed.tracks.length === 0) {
    return Response.json({ error: "El archivo no tiene canciones." }, { status: 422 });
  }

  const name =
    String(form.get("name") ?? "").trim() || parsed.playlistName || file.name.replace(/\.(csv|txt|tsv)$/i, "");
  const db = getDb();
  const { playlistId, trackCount } = importPlaylist(db, name, parsed);

  // En segundo plano: la UI consulta el progreso por polling.
  startProcessing(db, playlistId);

  return Response.json({
    playlistId,
    name,
    trackCount,
    source: parsed.source,
    encoding: parsed.encoding,
    skipped: parsed.skipped,
    withIsrc: parsed.tracks.filter((t) => t.isrc).length,
  });
}
