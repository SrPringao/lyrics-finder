import { getDb } from "@/lib/db";
import { getTrack } from "@/lib/db/repo";
import { playTrack } from "@/lib/spotify/api";
import { spotifyErrorResponse } from "@/lib/spotify/errors";
import { resolveTrack, spotifyLimiter } from "@/lib/spotify/resolver";

/** Arranca un poco antes de la línea: la versión de Spotify y la de LRCLIB pueden diferir un poco. */
const PREROLL_MS = 1500;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { trackId?: number; timeMs?: number | null; deviceId?: string | null } | null;
  if (!body?.trackId) return Response.json({ error: "Falta trackId." }, { status: 400 });

  const db = getDb();
  const track = getTrack(db, Number(body.trackId));
  if (!track) return Response.json({ error: "Canción no encontrada." }, { status: 404 });

  try {
    const newlyLinked = !track.spotify_uri;
    const uri = track.spotify_uri ?? (await spotifyLimiter.run(() => resolveTrack(db, track)));
    if (!uri) {
      // Quedó marcada como "No está en Spotify": la UI refresca la etiqueta.
      return Response.json(
        { error: "No encontré esta canción en Spotify. Prueba con “Abrir en Spotify”, que la busca por nombre.", code: "not_on_spotify" },
        { status: 404, headers: { "x-track-updated": "1" } },
      );
    }
    const positionMs = body.timeMs != null ? Math.max(0, body.timeMs - PREROLL_MS) : 0;
    await playTrack(db, { uri, positionMs, deviceId: body.deviceId ?? null });
    return Response.json({ ok: true, uri, positionMs, newlyLinked });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
