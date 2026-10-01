import { getDb } from "@/lib/db";
import { getDevices } from "@/lib/spotify/api";
import { spotifyErrorResponse } from "@/lib/spotify/errors";

export async function GET() {
  try {
    return Response.json({ devices: await getDevices(getDb()) });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
