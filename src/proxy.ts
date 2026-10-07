import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth/session";
import { requestOrigin } from "@/lib/spotify/origin";

export function proxy(req: NextRequest) {
  if (isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
  }
  const login = new URL("/acceso", requestOrigin(req));
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Todo menos la pantalla de acceso y los archivos estáticos.
  matcher: ["/((?!acceso|_next/static|_next/image|favicon.ico).*)"],
};
