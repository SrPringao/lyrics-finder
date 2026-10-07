import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Acceso con contraseña. APP_PASSWORD da acceso completo; GUEST_PASSWORD (opcional) da acceso de
 * invitado: buscar y reproducir, sin modificar nada. Sin APP_PASSWORD la app queda abierta, como en local.
 * La cookie guarda un HMAC de la contraseña: cambiarla cierra las sesiones de ese rol.
 */
export const SESSION_COOKIE = "lf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export type Role = "owner" | "guest";

export function appPassword(): string | null {
  return process.env.APP_PASSWORD?.trim() || null;
}

function guestPassword(): string | null {
  return process.env.GUEST_PASSWORD?.trim() || null;
}

function passwordFor(role: Role): string | null {
  return role === "owner" ? appPassword() : appPassword() && guestPassword();
}

function token(password: string, role: Role): string {
  return createHmac("sha256", password)
    .update(role === "owner" ? "lyrics-finder-session" : "lyrics-finder-session:guest")
    .digest("hex");
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Rol que corresponde a la contraseña escrita (la de dueño gana si ambas coinciden). */
export function roleForPassword(input: string): Role | null {
  for (const role of ["owner", "guest"] as const) {
    const password = passwordFor(role);
    if (password && sameText(input, password)) return role;
  }
  return null;
}

export function sessionToken(role: Role): string | null {
  const password = passwordFor(role);
  return password ? token(password, role) : null;
}

/** Rol de la cookie de sesión; null si no hay sesión válida. */
export function sessionRole(value: string | undefined): Role | null {
  if (!appPassword()) return "owner";
  if (!value) return null;
  for (const role of ["owner", "guest"] as const) {
    const expected = sessionToken(role);
    if (expected && sameText(value, expected)) return role;
  }
  return null;
}

/** Solo rutas internas, para no redirigir a otro sitio después de entrar. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/buscar";
}
