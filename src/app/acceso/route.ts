import { appPassword, checkPassword, safeNext, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/spotify/origin";

// Página suelta (sin el layout de la app): fuera de sesión las APIs que usa el layout responden 401.
function page(next: string, error: boolean): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acceso - Letras de mis playlists</title>
<style>
  :root { color-scheme: light dark; --bg: #fff; --ink: #1d1d1f; --muted: #6e6e73; --line: #d2d2d7; --accent: #1d1d1f; --on-accent: #fff; --err: #c9302c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111; --ink: #f5f5f7; --muted: #a1a1a6; --line: #3a3a3c; --accent: #f5f5f7; --on-accent: #111; --err: #ff6b63; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink);
         font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; }
  form { width: 100%; max-width: 340px; display: grid; gap: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--muted); font-size: 14px; }
  input { font: inherit; padding: 11px 12px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: inherit; }
  button { font: inherit; font-weight: 600; padding: 11px 12px; border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent); cursor: pointer; }
  .err { color: var(--err); }
</style>
</head>
<body>
<form method="post" action="/acceso">
  <h1>Letras de mis playlists</h1>
  <p>Escribe la contraseña para entrar.</p>
  ${error ? '<p class="err" role="alert">Contraseña incorrecta.</p>' : ""}
  <input type="hidden" name="next" value="${esc(next)}">
  <input type="password" name="password" aria-label="Contraseña" autocomplete="current-password" autofocus required>
  <button type="submit">Entrar</button>
</form>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  if (!appPassword()) return Response.redirect(new URL(next, requestOrigin(req)), 303);
  return page(next, false);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const next = safeNext(form.get("next")?.toString());
  const origin = requestOrigin(req);
  if (!appPassword()) return Response.redirect(new URL(next, origin), 303);

  if (!checkPassword(form.get("password")?.toString() ?? "")) {
    // Frena un poco los intentos a ciegas.
    await new Promise((r) => setTimeout(r, 1000));
    return page(next, true);
  }
  const secure = origin.protocol === "https:" ? "; Secure" : "";
  // Response.redirect() tiene cabeceras inmutables: no deja agregar la cookie.
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL(next, origin).toString(),
      "Set-Cookie": `${SESSION_COOKIE}=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`,
    },
  });
}
