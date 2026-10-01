/** Origen público de la petición (respeta el Host con el que el navegador abrió la app). */
export function requestOrigin(req: Request): URL {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) url.host = host;
  return new URL(url.origin);
}

export function redirectUriFor(origin: URL): string {
  return process.env.SPOTIFY_REDIRECT_URI?.trim() || `${origin.origin}/api/spotify/callback`;
}
