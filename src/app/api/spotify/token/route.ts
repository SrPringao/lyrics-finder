import { getDb } from "@/lib/db";
import { getAccessToken, getAuth } from "@/lib/spotify/auth";

/** Token para el Web Playback SDK (la app es local: solo lo ve tu navegador). */
export async function GET() {
  const db = getDb();
  try {
    const accessToken = await getAccessToken(db);
    return Response.json({ accessToken, expiresAt: getAuth(db)?.expires_at ?? null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 401 });
  }
}
