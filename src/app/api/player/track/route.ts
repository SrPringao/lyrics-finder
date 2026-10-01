import { getDb } from "@/lib/db";
import { findTrackIdByUri, getTrackPayload } from "@/lib/db/repo";

/** Busca en la biblioteca la canción que está sonando en Spotify (por su URI). */
export async function GET(req: Request) {
  const uris = new URL(req.url).searchParams.getAll("uri").filter((u) => /^spotify:track:[A-Za-z0-9]+$/.test(u));
  if (uris.length === 0) return Response.json({ error: "Falta uri." }, { status: 400 });
  const db = getDb();
  const id = findTrackIdByUri(db, uris);
  return Response.json({ track: id ? getTrackPayload(db, id) : null });
}
