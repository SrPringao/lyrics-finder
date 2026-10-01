import { getDb } from "@/lib/db";
import { isValidClientId, saveClientId } from "@/lib/spotify/auth";

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: unknown } | null;
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  if (!isValidClientId(clientId)) {
    return Response.json({ error: "El Client ID son 32 caracteres (letras a-f y números). Revisa que lo hayas copiado completo." }, { status: 400 });
  }
  saveClientId(getDb(), clientId);
  return Response.json({ ok: true });
}
