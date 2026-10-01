import { getDb } from "@/lib/db";
import { getSearchBlockedUntil } from "@/lib/spotify/api";
import { getAuth, getClientId } from "@/lib/spotify/auth";

export async function GET() {
  const db = getDb();
  const auth = getAuth(db);
  return Response.json({
    configured: !!getClientId(db),
    connected: !!auth,
    displayName: auth?.display_name ?? null,
    product: auth?.product ?? null,
    searchBlockedUntil: getSearchBlockedUntil(db),
  });
}
