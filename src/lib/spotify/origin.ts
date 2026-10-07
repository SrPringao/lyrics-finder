/** Origen público de la petición (respeta el Host con el que el navegador abrió la app). */
export function requestOrigin(req: Request): URL {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? req.headers.get("host");
  if (host) {
    // Asignar `host` sin puerto conserva el anterior (el :3000 interno), así que se limpia antes.
    url.port = "";
    url.host = host;
  }
  // Detrás de un proxy con HTTPS (Coolify, Caddy...) Node solo ve http.
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto === "http" || proto === "https") url.protocol = `${proto}:`;
  return new URL(url.origin);
}

export function redirectUriFor(origin: URL): string {
  return process.env.SPOTIFY_REDIRECT_URI?.trim() || `${origin.origin}/api/spotify/callback`;
}
