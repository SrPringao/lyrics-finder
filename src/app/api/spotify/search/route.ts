import { getDb } from "@/lib/db";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { searchCatalog } from "@/lib/spotify/library";
import { isSpotifyConnected } from "@/lib/spotify/resolver";

/** Busca canciones o álbumes en el catálogo de Spotify (10 resultados). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const type = url.searchParams.get("type") === "album" ? "album" : "track";
  if (!q) return Response.json({ items: [] });
  const db = getDb();
  if (!isSpotifyConnected(db)) return Response.json({ error: "Conecta tu cuenta de Spotify primero." }, { status: 401 });
  try {
    return Response.json({ items: await searchCatalog(db, q, type) });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
