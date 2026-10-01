import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/spotify/api";
import { exchangeCode, getClientId, saveTokens } from "@/lib/spotify/auth";
import { redirectUriFor, requestOrigin } from "@/lib/spotify/origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = requestOrigin(req);
  const jar = await cookies();
  const verifier = jar.get("sp_verifier")?.value;
  const state = jar.get("sp_state")?.value;
  const next = jar.get("sp_next")?.value ?? "/buscar";
  for (const c of ["sp_verifier", "sp_state", "sp_next"]) jar.delete({ name: c, path: "/api/spotify" });

  const fail = (msg: string) => Response.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}spotify_error=${encodeURIComponent(msg)}`, origin), 303);

  if (url.searchParams.get("error")) return fail(`Spotify: ${url.searchParams.get("error")}`);
  const code = url.searchParams.get("code");
  const db = getDb();
  const clientId = getClientId(db);
  if (!code || !verifier || !clientId || url.searchParams.get("state") !== state) {
    return fail("El inicio de sesión expiró o no coincide. Inténtalo de nuevo.");
  }

  try {
    const tokens = await exchangeCode({ clientId, code, redirectUri: redirectUriFor(origin), verifier });
    const profile = await getProfile(tokens.access_token);
    saveTokens(db, tokens, profile);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
  return Response.redirect(new URL(next, origin), 303);
}
