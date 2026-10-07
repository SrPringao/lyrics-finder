import { cookies } from "next/headers";
import { sessionRole, SESSION_COOKIE } from "@/lib/auth/session";

/** Para componentes de servidor: true si quien ve la página entró como invitado. */
export async function isGuest(): Promise<boolean> {
  const jar = await cookies();
  return sessionRole(jar.get(SESSION_COOKIE)?.value) === "guest";
}
