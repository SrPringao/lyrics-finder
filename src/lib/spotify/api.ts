import type { DB } from "@/lib/db";
import { cleanTitle, normalizeForCompare } from "@/lib/lrclib/client";
import { getAccessToken } from "@/lib/spotify/auth";

const API = "https://api.spotify.com/v1";

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images?: SpotifyImage[] };
  linked_from?: { uri: string } | null;
  external_ids?: { isrc?: string };
  is_playable?: boolean;
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

/** La imagen más cercana a 300 px (Spotify da 640, 300 y 64). */
export function pickCover(images: SpotifyImage[] | undefined | null): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => Math.abs((a.width ?? 300) - 300) - Math.abs((b.width ?? 300) - 300));
  return sorted[0].url;
}

/** Solo se aceptan portadas del CDN de imágenes de Spotify. */
export function isSpotifyImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "i.scdn.co" || u.hostname.endsWith(".scdn.co") || u.hostname.endsWith(".spotifycdn.com"));
  } catch {
    return false;
  }
}

export interface SpotifyDevice {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

export class SpotifyApiError extends Error {
  constructor(
    public status: number,
    public reason: string | null,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Esperas más largas que esto no se esperan: se reporta el bloqueo y se sigue sin Spotify. */
const MAX_WAIT_SEC = 30;

// ---------------------------------------------------------------------------
// Cupo de búsquedas (modo desarrollo de Spotify): si se agota, Spotify bloquea ~24 h.
// ---------------------------------------------------------------------------

const BLOCK_KEY = "spotify_search_blocked_until";

export function getSearchBlockedUntil(db: DB): number | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(BLOCK_KEY) as { value: string } | undefined;
  const until = row ? Number(row.value) : 0;
  return until > Date.now() ? until : null;
}

function setSearchBlockedUntil(db: DB, until: number) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    BLOCK_KEY,
    String(until),
  );
}

export function quotaMessage(until: number): string {
  const hora = new Date(until).toLocaleString("es-MX", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  return `Spotify pausó las búsquedas de esta app hasta el ${hora} (se agotó el cupo diario).`;
}

/** Llamada autenticada: refresca el token ante 401 y respeta Retry-After ante 429. */
export async function spotifyFetch(db: DB, path: string, init: RequestInit = {}, opts: ApiOptions = {}): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxRetries = opts.maxRetries ?? 3;
  let forceRefresh = false;

  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(db, { force: forceRefresh, fetchImpl });
    const res = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && !forceRefresh) {
      forceRefresh = true;
      continue;
    }
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitSec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 2 ** attempt;
      const body = await res
        .clone()
        .json()
        .catch(() => ({}));
      const reason: string | null = body?.error?.reason ?? null;
      // Cupo agotado o espera de horas: no tiene caso esperar. Se anota y se avisa.
      if (reason === "QUOTA_EXCEEDED" || waitSec > MAX_WAIT_SEC || attempt >= maxRetries) {
        const until = Date.now() + waitSec * 1000;
        if (path.startsWith("/search")) setSearchBlockedUntil(db, until);
        throw new SpotifyApiError(429, reason ?? "RATE_LIMITED", quotaMessage(until));
      }
      await sleep(waitSec * 1000);
      forceRefresh = false;
      continue;
    }
    if (res.status >= 500 && attempt < maxRetries) {
      await sleep(1000 * 2 ** attempt);
      forceRefresh = false;
      continue;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const reason: string | null = body?.error?.reason ?? null;
      throw new SpotifyApiError(res.status, reason, body?.error?.message ?? `Spotify respondió ${res.status}`);
    }
    return res;
  }
}

export async function getProfile(token: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403) {
    // Modo desarrollo: Spotify deja aceptar el login, pero rechaza a cuentas que no están en la lista.
    throw new SpotifyApiError(
      403,
      "USER_NOT_REGISTERED",
      "Spotify no permite esta cuenta en la app todavía. El dueño de la app debe agregar el correo de esta cuenta de Spotify en developer.spotify.com/dashboard → la app → User Management (máximo 5 cuentas). Después vuelve a conectar.",
    );
  }
  if (!res.ok) throw new SpotifyApiError(res.status, null, `No pude leer el perfil de Spotify (${res.status})`);
  return (await res.json()) as { id: string; display_name: string | null; product: string | null };
}

async function searchTracks(db: DB, q: string, opts: ApiOptions): Promise<SpotifyTrack[]> {
  const blocked = getSearchBlockedUntil(db);
  if (blocked) throw new SpotifyApiError(429, "QUOTA_EXCEEDED", quotaMessage(blocked));
  const params = new URLSearchParams({ q, type: "track", limit: "10", market: "from_token" });
  const res = await spotifyFetch(db, `/search?${params}`, {}, opts);
  const data = (await res.json()) as { tracks?: { items: (SpotifyTrack | null)[] } };
  return (data.tracks?.items ?? []).filter((t): t is SpotifyTrack => !!t);
}

export async function searchByIsrc(db: DB, isrc: string, opts: ApiOptions = {}): Promise<SpotifyTrack | null> {
  const items = await searchTracks(db, `isrc:${isrc}`, opts);
  return items.find((t) => t.is_playable !== false) ?? items[0] ?? null;
}

/**
 * Elige la mejor coincidencia por texto: el título (sin "feat.", "Remastered"…) debe
 * coincidir y algún artista debe aparecer; luego, la duración más cercana si se conoce.
 */
export function pickBestTextMatch(
  items: SpotifyTrack[],
  q: { title: string; artist: string; durationSec?: number | null },
): SpotifyTrack | null {
  const title = normalizeForCompare(cleanTitle(q.title));
  const artist = normalizeForCompare(q.artist);
  const candidates = items.filter((t) => {
    if (normalizeForCompare(cleanTitle(t.name)) !== title) return false;
    return t.artists.some((a) => {
      const n = normalizeForCompare(a.name);
      return n && (artist.includes(n) || n.includes(artist));
    });
  });
  if (candidates.length === 0) return null;
  const dist = (t: SpotifyTrack) => (q.durationSec ? Math.abs(t.duration_ms / 1000 - q.durationSec) : 0);
  return [...candidates].sort((a, b) => Number(b.is_playable !== false) - Number(a.is_playable !== false) || dist(a) - dist(b))[0];
}

export async function searchByText(
  db: DB,
  q: { title: string; artist: string; durationSec?: number | null },
  opts: ApiOptions = {},
): Promise<SpotifyTrack | null> {
  const strip = (s: string) => s.replace(/["']/g, " ");
  const items = await searchTracks(db, `track:${strip(cleanTitle(q.title))} artist:${strip(q.artist)}`, opts);
  return pickBestTextMatch(items, q);
}

export async function getDevices(db: DB, opts: ApiOptions = {}): Promise<SpotifyDevice[]> {
  const res = await spotifyFetch(db, "/me/player/devices", {}, opts);
  return ((await res.json()) as { devices: SpotifyDevice[] }).devices;
}

export interface RemotePlayerState {
  isPlaying: boolean;
  progressMs: number;
  /** Momento (epoch ms) en que Spotify midió progressMs. */
  timestamp: number;
  deviceId: string | null;
  volumePercent: number | null;
  item: { uri: string; linkedFromUri: string | null; name: string; artists: string; durationMs: number; coverUrl: string | null } | null;
}

/** Estado del reproductor en cualquier dispositivo (para cuando no suena en este navegador). */
export async function getPlayerState(db: DB, opts: ApiOptions = {}): Promise<RemotePlayerState | null> {
  const res = await spotifyFetch(db, "/me/player?additional_types=track", {}, opts);
  if (res.status === 204) return null;
  const data = (await res.json().catch(() => null)) as {
    is_playing: boolean;
    progress_ms: number | null;
    timestamp: number;
    device?: { id: string | null; volume_percent: number | null };
    item?: SpotifyTrack | null;
  } | null;
  if (!data) return null;
  const item = data.item ?? null;
  return {
    isPlaying: data.is_playing,
    progressMs: data.progress_ms ?? 0,
    timestamp: Date.now(),
    deviceId: data.device?.id ?? null,
    volumePercent: data.device?.volume_percent ?? null,
    item: item
      ? {
          uri: item.uri,
          linkedFromUri: item.linked_from?.uri ?? null,
          name: item.name,
          artists: item.artists.map((a) => a.name).join(", "),
          durationMs: item.duration_ms,
          coverUrl: pickCover(item.album?.images),
        }
      : null,
  };
}

export type ControlAction =
  | { action: "pause" }
  | { action: "resume" }
  | { action: "seek"; positionMs: number }
  | { action: "volume"; volumePercent: number };

/** Controla la reproducción en otro dispositivo (celular, app de escritorio…). */
export async function controlPlayback(db: DB, c: ControlAction & { deviceId?: string | null }, opts: ApiOptions = {}): Promise<void> {
  const qs = new URLSearchParams();
  if (c.deviceId) qs.set("device_id", c.deviceId);
  let path: string;
  if (c.action === "pause") path = "/me/player/pause";
  else if (c.action === "resume") path = "/me/player/play";
  else if (c.action === "seek") {
    qs.set("position_ms", String(Math.max(0, Math.round(c.positionMs))));
    path = "/me/player/seek";
  } else {
    qs.set("volume_percent", String(Math.min(100, Math.max(0, Math.round(c.volumePercent)))));
    path = "/me/player/volume";
  }
  const q = qs.toString();
  await spotifyFetch(db, `${path}${q ? `?${q}` : ""}`, { method: "PUT" }, opts);
}

export async function playTrack(
  db: DB,
  args: { uri: string; positionMs: number; deviceId?: string | null },
  opts: ApiOptions = {},
): Promise<void> {
  const qs = args.deviceId ? `?device_id=${encodeURIComponent(args.deviceId)}` : "";
  await spotifyFetch(
    db,
    `/me/player/play${qs}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [args.uri], position_ms: Math.max(0, Math.round(args.positionMs)) }),
    },
    opts,
  );
}
