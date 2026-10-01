import { getDb } from "@/lib/db";
import { getPlayerState } from "@/lib/spotify/api";
import { spotifyErrorResponse } from "@/lib/spotify/errors";

/** Qué suena y en qué segundo, en el dispositivo activo (cuando no es este navegador). */
export async function GET() {
  try {
    return Response.json({ state: await getPlayerState(getDb()) });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
