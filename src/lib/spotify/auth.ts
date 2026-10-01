import { createHash, randomBytes } from "node:crypto";
import { SPOTIFY_CLIENT_ID } from "@/config/spotify";
import type { DB } from "@/lib/db";

export const SCOPES = [
  "user-modify-playback-state", // reproducir / pausar / saltar a un segundo
  "user-read-playback-state", // listar dispositivos
  "streaming", // reproductor dentro de la página (Web Playback SDK)
  "user-read-email",
  "user-read-private", // saber si la cuenta es Premium
].join(" ");

const ACCOUNTS = "https://accounts.spotify.com";

export interface SpotifyAuthRow {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  user_id: string | null;
  display_name: string | null;
  product: string | null;
}

/**
 * Client ID de la app de Spotify: .env.local, luego el que viene en el código
 * (src/config/spotify.ts) y, por último, uno guardado desde la página /spotify.
 */
export function getClientId(db: DB): string | null {
  const fromEnv = process.env.SPOTIFY_CLIENT_ID?.trim();
  if (fromEnv) return fromEnv;
  if (SPOTIFY_CLIENT_ID) return SPOTIFY_CLIENT_ID;
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'spotify_client_id'").get() as { value: string } | undefined;
  return row?.value || null;
}

export function isValidClientId(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value.trim());
}

export function saveClientId(db: DB, value: string): void {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES ('spotify_client_id', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  ).run(value.trim());
  // Un Client ID distinto invalida la sesión anterior.
  clearAuth(db);
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636): no hace falta client secret
// ---------------------------------------------------------------------------

const base64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createVerifier(): string {
  return base64url(randomBytes(64));
}

export function challengeFor(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; verifier: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challengeFor(opts.verifier),
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>, fetchImpl: typeof fetch = fetch): Promise<TokenResponse> {
  const res = await fetchImpl(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Spotify rechazó el token: ${data.error_description ?? data.error ?? res.status}`);
  return data as TokenResponse;
}

export async function exchangeCode(
  opts: { clientId: string; code: string; redirectUri: string; verifier: string },
  fetchImpl?: typeof fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    {
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.verifier,
    },
    fetchImpl,
  );
}

// ---------------------------------------------------------------------------
// Sesión guardada en la base
// ---------------------------------------------------------------------------

export function saveTokens(db: DB, t: TokenResponse, profile?: { id: string; display_name: string | null; product: string | null }) {
  const expiresAt = Date.now() + (t.expires_in - 60) * 1000; // un minuto de margen
  const existing = getAuth(db);
  db.prepare(
    `INSERT INTO spotify_auth (id, access_token, refresh_token, expires_at, scope, user_id, display_name, product, updated_at)
     VALUES (1, @access, @refresh, @expiresAt, @scope, @userId, @name, @product, datetime('now'))
     ON CONFLICT (id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at, scope = COALESCE(excluded.scope, scope),
       user_id = COALESCE(excluded.user_id, user_id), display_name = COALESCE(excluded.display_name, display_name),
       product = COALESCE(excluded.product, product), updated_at = excluded.updated_at`,
  ).run({
    access: t.access_token,
    // Spotify a veces no devuelve un refresh token nuevo al refrescar: se conserva el anterior.
    refresh: t.refresh_token ?? existing?.refresh_token ?? "",
    expiresAt,
    scope: t.scope ?? null,
    userId: profile?.id ?? null,
    name: profile?.display_name ?? null,
    product: profile?.product ?? null,
  });
}

export function getAuth(db: DB): SpotifyAuthRow | undefined {
  return db.prepare("SELECT * FROM spotify_auth WHERE id = 1").get() as SpotifyAuthRow | undefined;
}

export function clearAuth(db: DB): void {
  db.prepare("DELETE FROM spotify_auth").run();
}

export class SpotifyNotConnectedError extends Error {
  constructor() {
    super("Spotify no está conectado.");
  }
}

// Evita dos refrescos simultáneos (el refresh token puede rotar).
const g = globalThis as unknown as { __spotifyRefresh?: Promise<string> | null };

/** Token válido, refrescándolo si ya caducó. */
export async function getAccessToken(db: DB, opts: { force?: boolean; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const auth = getAuth(db);
  if (!auth) throw new SpotifyNotConnectedError();
  if (!opts.force && auth.expires_at > Date.now()) return auth.access_token;
  const clientId = getClientId(db);
  if (!clientId) throw new SpotifyNotConnectedError();

  g.__spotifyRefresh ??= tokenRequest(
    { grant_type: "refresh_token", refresh_token: auth.refresh_token, client_id: clientId },
    opts.fetchImpl,
  )
    .then((t) => {
      saveTokens(db, t);
      return t.access_token;
    })
    .catch((err) => {
      // Refresh token revocado o inválido: hay que volver a iniciar sesión.
      if (String(err).includes("invalid_grant")) clearAuth(db);
      throw err;
    })
    .finally(() => {
      g.__spotifyRefresh = null;
    });
  return g.__spotifyRefresh;
}
