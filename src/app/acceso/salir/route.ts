import { SESSION_COOKIE } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/spotify/origin";

/** Cierra la sesión de la app (no la de Spotify). POST para que ningún prefetch la dispare. */
export async function POST(req: Request) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/acceso", requestOrigin(req)).toString(),
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}
