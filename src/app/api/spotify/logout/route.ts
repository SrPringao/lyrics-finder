import { getDb } from "@/lib/db";
import { clearAuth } from "@/lib/spotify/auth";

export async function POST() {
  clearAuth(getDb());
  return Response.json({ ok: true });
}
