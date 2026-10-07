import { NextResponse, type NextRequest } from "next/server";
import { guestCanAccess } from "@/lib/auth/guest";
import { sessionRole, SESSION_COOKIE } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/spotify/origin";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const role = sessionRole(req.cookies.get(SESSION_COOKIE)?.value);

  if (!role) {
    if (isApi) return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
    const login = new URL("/acceso", requestOrigin(req));
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  if (role === "guest" && !guestCanAccess(req.method, pathname)) {
    if (isApi) return Response.json({ error: "Los invitados solo pueden buscar y reproducir." }, { status: 403 });
    return NextResponse.redirect(new URL("/buscar", requestOrigin(req)));
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos la pantalla de acceso y los archivos estáticos.
  matcher: ["/((?!acceso|_next/static|_next/image|favicon.ico).*)"],
};
