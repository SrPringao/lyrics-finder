import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Acceso con una sola contraseña (APP_PASSWORD). Sin ella la app queda abierta, como en local.
 * La cookie guarda un HMAC de la contraseña: cambiarla cierra todas las sesiones.
 */
export const SESSION_COOKIE = "lf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export function appPassword(): string | null {
  return process.env.APP_PASSWORD?.trim() || null;
}

function token(password: string): string {
  return createHmac("sha256", password).update("lyrics-finder-session").digest("hex");
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input: string): boolean {
  const password = appPassword();
  return !!password && sameText(input, password);
}

export function sessionToken(): string | null {
  const password = appPassword();
  return password ? token(password) : null;
}

export function isValidSession(value: string | undefined): boolean {
  const expected = sessionToken();
  return !expected || (!!value && sameText(value, expected));
}

/** Solo rutas internas, para no redirigir a otro sitio después de entrar. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/buscar";
}
