import { getDb } from "@/lib/db";
import { controlPlayback, type ControlAction } from "@/lib/spotify/api";
import { spotifyErrorResponse } from "@/lib/spotify/errors";

/** Pausa, reanuda, busca o cambia el volumen en otro dispositivo. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as (Partial<ControlAction> & { deviceId?: string | null }) | null;
  let action: ControlAction;
  switch (body?.action) {
    case "pause":
    case "resume":
      action = { action: body.action };
      break;
    case "seek":
      if (typeof body.positionMs !== "number") return Response.json({ error: "Falta positionMs." }, { status: 400 });
      action = { action: "seek", positionMs: body.positionMs };
      break;
    case "volume":
      if (typeof body.volumePercent !== "number") return Response.json({ error: "Falta volumePercent." }, { status: 400 });
      action = { action: "volume", volumePercent: body.volumePercent };
      break;
    default:
      return Response.json({ error: "Acción no válida." }, { status: 400 });
  }
  try {
    await controlPlayback(getDb(), { ...action, deviceId: body.deviceId ?? null });
    return Response.json({ ok: true });
  } catch (err) {
    return spotifyErrorResponse(err);
  }
}
