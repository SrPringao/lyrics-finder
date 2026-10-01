import { SpotifyApiError } from "@/lib/spotify/api";
import { SpotifyNotConnectedError } from "@/lib/spotify/auth";

/** Traduce errores de Spotify a mensajes claros para la UI. */
export function spotifyErrorResponse(err: unknown): Response {
  if (err instanceof SpotifyNotConnectedError) {
    return Response.json({ error: "Conecta tu cuenta de Spotify primero.", code: "not_connected" }, { status: 401 });
  }
  if (err instanceof SpotifyApiError) {
    if (err.status === 404 || err.reason === "NO_ACTIVE_DEVICE") {
      return Response.json(
        { error: "No hay ningún dispositivo de Spotify activo. Abre Spotify en tu celular o computadora, o usa el reproductor del navegador.", code: "no_device" },
        { status: 409 },
      );
    }
    if (err.status === 429) {
      return Response.json({ error: err.message, code: "quota" }, { status: 429 });
    }
    if (err.reason === "PREMIUM_REQUIRED") {
      return Response.json({ error: "Spotify solo permite controlar la reproducción con cuentas Premium.", code: "premium" }, { status: 403 });
    }
    if (err.status === 403) {
      return Response.json(
        { error: `Spotify negó el acceso (${err.message}). ¿Tu cuenta está agregada en "User Management" de tu app de Spotify?`, code: "forbidden" },
        { status: 403 },
      );
    }
    return Response.json({ error: err.message, code: "spotify" }, { status: 502 });
  }
  return Response.json({ error: err instanceof Error ? err.message : String(err), code: "unknown" }, { status: 500 });
}
