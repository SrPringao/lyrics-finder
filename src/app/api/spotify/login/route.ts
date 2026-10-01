import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { buildAuthorizeUrl, createVerifier, getClientId } from "@/lib/spotify/auth";
import { redirectUriFor, requestOrigin } from "@/lib/spotify/origin";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  // Spotify no acepta "localhost" en el redirect; las cookies del login deben vivir en 127.0.0.1.
  if (origin.hostname === "localhost") {
    const target = new URL(req.url);
    target.host = origin.host.replace("localhost", "127.0.0.1");
    return Response.redirect(target, 307);
  }

  const clientId = getClientId(getDb());
  if (!clientId) return Response.redirect(new URL("/spotify", origin), 307);

  const verifier = createVerifier();
  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/api/spotify", maxAge: 600 };
  jar.set("sp_verifier", verifier, opts);
  jar.set("sp_state", state, opts);
  const back = new URL(req.url).searchParams.get("next");
  jar.set("sp_next", back && back.startsWith("/") ? back : "/buscar", opts);

  return Response.redirect(buildAuthorizeUrl({ clientId, redirectUri: redirectUriFor(origin), state, verifier }), 307);
}
