/**
 * Lo que puede hacer un invitado: ver, buscar y reproducir con la sesión de Spotify del dueño.
 * Todo lo demás (importar, borrar, editar letras, conectar/desconectar Spotify) queda bloqueado.
 */
const GUEST_API: [method: string, path: RegExp][] = [
  ["GET", /^\/api\/spotify\/(status|token|player|devices)$/],
  ["POST", /^\/api\/spotify\/(play|control)$/],
  ["GET", /^\/api\/player\/track$/],
  ["GET", /^\/api\/tracks\/\d+$/],
  // La portada se guarda sola al sonar una canción; no cambia nada que el invitado elija.
  ["POST", /^\/api\/tracks\/\d+\/cover$/],
  ["GET", /^\/api\/playlists\/\d+$/],
];

const OWNER_PAGES = /^\/(importar|spotify)(\/|$)/;

export function guestCanAccess(method: string, pathname: string): boolean {
  if (pathname.startsWith("/api/")) {
    const m = method === "HEAD" ? "GET" : method;
    return GUEST_API.some(([allowed, path]) => allowed === m && path.test(pathname));
  }
  return !OWNER_PAGES.test(pathname);
}
