import { afterEach, describe, expect, it, vi } from "vitest";
import { guestCanAccess } from "@/lib/auth/guest";
import { roleForPassword, sessionRole, sessionToken } from "@/lib/auth/session";

afterEach(() => vi.unstubAllEnvs());

describe("sesiones por rol", () => {
  it("sin APP_PASSWORD todo es acceso completo", () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("GUEST_PASSWORD", "invitado");
    expect(sessionRole(undefined)).toBe("owner");
    expect(roleForPassword("invitado")).toBeNull();
  });

  it("distingue dueño e invitado", () => {
    vi.stubEnv("APP_PASSWORD", "dueño");
    vi.stubEnv("GUEST_PASSWORD", "invitado");
    expect(roleForPassword("dueño")).toBe("owner");
    expect(roleForPassword("invitado")).toBe("guest");
    expect(roleForPassword("otra")).toBeNull();
    expect(sessionRole(sessionToken("owner")!)).toBe("owner");
    expect(sessionRole(sessionToken("guest")!)).toBe("guest");
    expect(sessionRole("falsa")).toBeNull();
    expect(sessionRole(undefined)).toBeNull();
  });

  it("sin GUEST_PASSWORD no hay acceso de invitado", () => {
    vi.stubEnv("APP_PASSWORD", "dueño");
    vi.stubEnv("GUEST_PASSWORD", "");
    expect(roleForPassword("")).toBeNull();
    expect(sessionToken("guest")).toBeNull();
  });

  it("cambiar la contraseña de invitado cierra esas sesiones, no las del dueño", () => {
    vi.stubEnv("APP_PASSWORD", "dueño");
    vi.stubEnv("GUEST_PASSWORD", "invitado");
    const owner = sessionToken("owner")!;
    const guest = sessionToken("guest")!;
    vi.stubEnv("GUEST_PASSWORD", "nueva");
    expect(sessionRole(guest)).toBeNull();
    expect(sessionRole(owner)).toBe("owner");
  });
});

describe("permisos de invitado", () => {
  it("puede ver, buscar y reproducir", () => {
    for (const path of ["/buscar", "/biblioteca", "/biblioteca/3", "/cancion/12", "/"]) expect(guestCanAccess("GET", path)).toBe(true);
    for (const path of ["/api/spotify/status", "/api/spotify/token", "/api/spotify/player", "/api/spotify/devices", "/api/player/track", "/api/tracks/5"]) {
      expect(guestCanAccess("GET", path)).toBe(true);
    }
    expect(guestCanAccess("POST", "/api/spotify/play")).toBe(true);
    expect(guestCanAccess("POST", "/api/spotify/control")).toBe(true);
  });

  it("no puede importar, editar, borrar ni tocar la sesión de Spotify", () => {
    expect(guestCanAccess("GET", "/importar")).toBe(false);
    expect(guestCanAccess("GET", "/spotify")).toBe(false);
    const blocked: [string, string][] = [
      ["POST", "/api/import"],
      ["POST", "/api/spotify/import"],
      ["POST", "/api/spotify/add"],
      ["GET", "/api/spotify/search"],
      ["GET", "/api/spotify/playlists"],
      ["GET", "/api/spotify/login"],
      ["GET", "/api/spotify/callback"],
      ["POST", "/api/spotify/logout"],
      ["PUT", "/api/spotify/config"],
      ["DELETE", "/api/playlists/3"],
      ["POST", "/api/playlists/3/fetch"],
      ["POST", "/api/playlists/3/spotify"],
      ["PUT", "/api/tracks/5/lyrics"],
      ["PUT", "/api/tracks/5/ignore"],
      ["POST", "/api/tracks/5/fetch"],
    ];
    for (const [method, path] of blocked) expect(guestCanAccess(method, path), `${method} ${path}`).toBe(false);
  });
});
