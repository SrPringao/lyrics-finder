"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { TrackPayload } from "@/lib/db/repo";
import { DEFAULT_TINT, deriveTint, dominantFromPixels, type TintPalette } from "@/lib/player/tint";
import { nextMention, prevMention, PREROLL_MS } from "@/lib/player/timing";

export const BROWSER_DEVICE = "browser";

export interface Status {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  product: string | null;
  searchBlockedUntil?: number | null;
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

/** Canción que suena. `id` null = suena algo que no está en la biblioteca. */
export interface NowTrack {
  id: number | null;
  uri: string | null;
  title: string;
  artist: string;
  coverUrl: string | null;
  durationMs: number | null;
  lyricsStatus: string | null;
  lines: { i: number; t: number | null; text: string }[];
}

export interface SearchContext {
  q: string;
  mode: "palabra" | "contiene";
  /** Todas las canciones del resultado (no solo la página), con los tiempos de sus menciones. */
  results: { trackId: number; times: number[] }[];
}

interface ExternalState {
  uri: string;
  linkedFromUri: string | null;
  name: string;
  artists: string;
  durationMs: number;
  coverUrl: string | null;
  positionMs: number;
  paused: boolean;
}

interface SpotifyContextValue {
  status: Status | null;
  browserDeviceId: string | null;
  sdkError: string | null;
  selectedDevice: string;
  setSelectedDevice: (id: string) => void;
  devices: Device[];
  loadDevices: () => void;
  message: { text: string; error: boolean } | null;
  flash: (text: string, error?: boolean) => void;
  playingKey: string | null;
  track: NowTrack | null;
  paused: boolean;
  durationMs: number | null;
  volume: number;
  setVolume: (v: number) => void;
  searchContext: SearchContext | null;
  setSearchContext: (ctx: SearchContext | null) => void;
  mentions: number[];
  canPrev: boolean;
  canNext: boolean;
  /** Reproduce una canción desde un tiempo (o la mueve ahí si ya está sonando). */
  play: (trackId: number, timeMs: number | null, key?: string) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  skip: (deltaMs: number) => Promise<void>;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  getPositionMs: () => number;
  palette: TintPalette;
  logout: () => Promise<void>;
}

const Ctx = createContext<SpotifyContextValue | null>(null);

export function useSpotify(): SpotifyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSpotify fuera de SpotifyProvider");
  return v;
}

/**
 * Posición de la canción, recalculada en cada cuadro (requestAnimationFrame) pero que solo
 * vuelve a pintar el componente cuando cambia de "paso" (`stepMs`).
 */
export function usePositionMs(stepMs = 100): number {
  const { getPositionMs } = useSpotify();
  const [pos, setPos] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const p = getPositionMs();
      const bucket = Math.floor(p / stepMs);
      if (bucket !== last) {
        last = bucket;
        setPos(bucket * stepMs);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getPositionMs, stepMs]);
  return pos;
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(reducedMotionQuery);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

function readStored<T>(key: string, fallback: T, parse: (s: string) => T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: solo dura esta visita
  }
}

function toNowTrack(p: TrackPayload): NowTrack {
  return {
    id: p.id,
    uri: p.spotifyUri,
    title: p.title,
    artist: p.artist,
    coverUrl: p.coverUrl,
    durationMs: p.durationMs,
    lyricsStatus: p.lyricsStatus,
    lines: p.lines,
  };
}

function applyPalette(p: TintPalette) {
  const el = document.documentElement.style;
  el.setProperty("--color-tint", p.tint);
  el.setProperty("--color-tint-ink", p.ink);
  el.setProperty("--color-tint-secondary", p.secondary);
  el.setProperty("--color-tint-accent", p.accent);
  el.setProperty("--color-tint-mark", p.mark);
  el.setProperty("--color-tint-chip", p.chipBorder);
}

/** Color dominante de la portada con un canvas pequeño (la imagen debe permitir CORS). */
function paletteFromCover(url: string): Promise<TintPalette> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(DEFAULT_TINT);
        ctx.drawImage(img, 0, 0, size, size);
        resolve(deriveTint(dominantFromPixels(ctx.getImageData(0, 0, size, size).data)));
      } catch {
        resolve(DEFAULT_TINT); // canvas "contaminado" (sin CORS)
      }
    };
    img.onerror = () => resolve(DEFAULT_TINT);
    img.src = url;
  });
}

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [browserDeviceId, setBrowserDeviceId] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDeviceState] = useState<string>(BROWSER_DEVICE);
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [track, setTrack] = useState<NowTrack | null>(null);
  const [paused, setPaused] = useState(true);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [searchContext, setSearchContext] = useState<SearchContext | null>(null);
  const [palette, setPalette] = useState<TintPalette>(DEFAULT_TINT);

  const playerRef = useRef<Spotify.Player | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clock = useRef({ baseMs: 0, at: 0, paused: true, durationMs: 0 });
  const trackRef = useRef<NowTrack | null>(null);
  const lastLookup = useRef<string | null>(null);
  const coverSent = useRef<Set<number>>(new Set());
  const volumeRef = useRef(0.8);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const useBrowser = selectedDevice === BROWSER_DEVICE;

  const flash = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), error ? 8000 : 3000);
  }, []);

  const getPositionMs = useCallback(() => {
    const c = clock.current;
    const raw = c.paused ? c.baseMs : c.baseMs + (performance.now() - c.at);
    return c.durationMs > 0 ? Math.min(raw, c.durationMs) : raw;
  }, []);

  const setClock = useCallback((positionMs: number, isPaused: boolean) => {
    clock.current = { ...clock.current, baseMs: Math.max(0, positionMs), at: performance.now(), paused: isPaused };
    setPaused(isPaused);
  }, []);

  const setDuration = useCallback((ms: number | null) => {
    clock.current.durationMs = ms ?? 0;
    setDurationMs(ms);
  }, []);

  // ---------------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/spotify/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => {
        setSelectedDeviceState(readStored("spotifyDevice", BROWSER_DEVICE, String));
        const v = readStored("spotifyVolume", 0.8, (x) => Math.min(1, Math.max(0, Number(x) || 0)));
        volumeRef.current = v;
        setVolumeState(v);
        setStatus(s);
      })
      .catch(() => setStatus({ configured: false, connected: false, displayName: null, product: null }));
    const url = new URL(window.location.href);
    const err = url.searchParams.get("spotify_error");
    if (err) {
      setTimeout(() => flash(err, true), 0);
      url.searchParams.delete("spotify_error");
      window.history.replaceState(null, "", url);
    }
  }, [flash]);

  // ---------------------------------------------------------------------------
  // Qué suena: estado que llega del SDK o de la API (otro dispositivo)
  // ---------------------------------------------------------------------------

  const loadTrack = useCallback(async (trackId: number) => {
    const res = await fetch(`/api/tracks/${trackId}`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = (await res.json()) as TrackPayload;
    lastLookup.current = payload.spotifyUri;
    setTrack(toNowTrack(payload));
    if (payload.durationMs) setDuration(payload.durationMs);
  }, [setDuration]);

  const applyExternal = useCallback(
    (s: ExternalState) => {
      setClock(s.positionMs, s.paused);
      if (s.durationMs) setDuration(s.durationMs);
      const cur = trackRef.current;
      const same = cur && (cur.uri === s.uri || (s.linkedFromUri && cur.uri === s.linkedFromUri));
      if (!same && lastLookup.current !== s.uri) {
        // Cambió la canción (fin de la canción, o se cambió desde la app de Spotify).
        lastLookup.current = s.uri;
        const qs = new URLSearchParams([["uri", s.uri], ...(s.linkedFromUri ? [["uri", s.linkedFromUri]] : [])]);
        fetch(`/api/player/track?${qs}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d: { track: TrackPayload | null }) => {
            setTrack(
              d.track
                ? toNowTrack(d.track)
                : { id: null, uri: s.uri, title: s.name, artist: s.artists, coverUrl: s.coverUrl, durationMs: s.durationMs, lyricsStatus: null, lines: [] },
            );
          })
          .catch(() => {});
        return;
      }
      // Portada: si la canción aún no tiene, se toma la del reproductor y se guarda.
      if (cur && !cur.coverUrl && s.coverUrl) {
        setTrack({ ...cur, coverUrl: s.coverUrl });
        if (cur.id != null && !coverSent.current.has(cur.id)) {
          coverSent.current.add(cur.id);
          void fetch(`/api/tracks/${cur.id}/cover`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: s.coverUrl }),
          }).catch(() => {});
        }
      }
    },
    [setClock, setDuration],
  );

  const applySdkState = useCallback(
    (s: Spotify.PlaybackState | null) => {
      if (!s) return;
      const t = s.track_window.current_track;
      const images = [...(t.album?.images ?? [])].sort(
        (a, b) => Math.abs((a.width ?? 300) - 300) - Math.abs((b.width ?? 300) - 300),
      );
      applyExternal({
        uri: t.uri,
        linkedFromUri: t.linked_from?.uri ?? null,
        name: t.name,
        artists: t.artists.map((a) => a.name).join(", "),
        durationMs: s.duration || t.duration_ms,
        coverUrl: images[0]?.url ?? null,
        positionMs: s.position,
        paused: s.paused,
      });
    },
    [applyExternal],
  );

  // Reproductor dentro de la página (requiere Premium).
  useEffect(() => {
    if (!status?.connected || status.product !== "premium" || playerRef.current) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Letras (navegador)",
        volume: volumeRef.current,
        getOAuthToken: (cb) => {
          fetch("/api/spotify/token", { cache: "no-store" })
            .then((r) => r.json())
            .then((d) => d.accessToken && cb(d.accessToken))
            .catch(() => {});
        },
      });
      player.addListener("ready", ({ device_id }) => {
        setBrowserDeviceId(device_id);
        setSdkError(null);
      });
      player.addListener("not_ready", () => setBrowserDeviceId(null));
      player.addListener("initialization_error", ({ message }) => setSdkError(`Este navegador no puede reproducir Spotify (${message}).`));
      player.addListener("authentication_error", ({ message }) => setSdkError(`Sesión de Spotify inválida (${message}).`));
      player.addListener("account_error", () => setSdkError("El reproductor del navegador requiere Spotify Premium."));
      player.addListener("player_state_changed", (s) => applySdkState(s));
      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) window.onSpotifyWebPlaybackSDKReady();
    else if (!document.getElementById("spotify-sdk")) {
      const script = document.createElement("script");
      script.id = "spotify-sdk";
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [status, applySdkState]);

  // El SDK solo avisa en los cambios: se corrige la deriva de vez en cuando mientras suena.
  useEffect(() => {
    if (!useBrowser || !browserDeviceId || paused) return;
    const id = setInterval(() => {
      playerRef.current?.getCurrentState().then(applySdkState).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [useBrowser, browserDeviceId, paused, applySdkState]);

  // Otro dispositivo: se consulta la API cada 5 s mientras la pestaña está visible.
  useEffect(() => {
    if (!status?.connected || useBrowser) return;
    let stopped = false;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/spotify/player", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { state: { isPlaying: boolean; progressMs: number; item: (Omit<ExternalState, "positionMs" | "paused"> & { durationMs: number }) | null } | null } | null) => {
          if (stopped || !d?.state?.item) return;
          const { item } = d.state;
          applyExternal({ ...item, positionMs: d.state.progressMs, paused: !d.state.isPlaying });
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [status?.connected, useBrowser, applyExternal]);

  // Tinte de portada.
  useEffect(() => {
    const url = track?.coverUrl;
    let cancelled = false;
    (url ? paletteFromCover(url) : Promise.resolve(DEFAULT_TINT)).then((p) => {
      if (cancelled) return;
      applyPalette(p);
      setPalette(p);
    });
    return () => {
      cancelled = true;
    };
  }, [track?.coverUrl]);

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  const setSelectedDevice = useCallback((id: string) => {
    setSelectedDeviceState(id);
    writeStored("spotifyDevice", id);
  }, []);

  const loadDevices = useCallback(() => {
    fetch("/api/spotify/devices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { devices: [] }))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => {});
  }, []);

  const control = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/spotify/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, deviceId: selectedDevice }),
      });
      if (!res.ok) flash((await res.json().catch(() => ({}))).error ?? "No se pudo controlar la reproducción", true);
      return res.ok;
    },
    [selectedDevice, flash],
  );

  const seek = useCallback(
    async (ms: number) => {
      const c = clock.current;
      const target = Math.max(0, c.durationMs > 0 ? Math.min(ms, c.durationMs - 500) : ms);
      setClock(target, c.paused);
      if (useBrowser) await playerRef.current?.seek(target).catch(() => {});
      else await control({ action: "seek", positionMs: target });
    },
    [useBrowser, control, setClock],
  );

  const play = useCallback(
    async (trackId: number, timeMs: number | null, key?: string) => {
      const start = timeMs != null ? Math.max(0, timeMs - PREROLL_MS) : 0;
      // Misma canción: basta con moverse (y reanudar si estaba en pausa).
      if (trackRef.current?.id === trackId && (!useBrowser || browserDeviceId)) {
        await seek(start);
        if (clock.current.paused) {
          if (useBrowser) await playerRef.current?.resume().catch(() => {});
          else await control({ action: "resume" });
          setClock(start, false);
        }
        return;
      }
      if (useBrowser) {
        if (!browserDeviceId) {
          flash(sdkError ?? "El reproductor del navegador todavía se está conectando… o elige otro dispositivo.", true);
          return;
        }
        // Safari/móviles bloquean el audio si no se activa dentro del clic.
        await playerRef.current?.activateElement().catch(() => {});
      }
      setPlayingKey(key ?? String(trackId));
      try {
        const res = await fetch("/api/spotify/play", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trackId, timeMs, deviceId: useBrowser ? browserDeviceId : selectedDevice }),
        });
        const data = await res.json();
        if (!res.ok) flash(data.error ?? "No se pudo reproducir", true);
        else {
          setClock(data.positionMs ?? start, false);
          await loadTrack(trackId);
        }
        // La canción se acaba de vincular (o se marcó como no disponible): refresca la página.
        if (data.newlyLinked || res.headers.get("x-track-updated")) router.refresh();
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err), true);
      } finally {
        setPlayingKey(null);
      }
    },
    [useBrowser, browserDeviceId, selectedDevice, sdkError, flash, router, seek, control, setClock, loadTrack],
  );

  const togglePlay = useCallback(async () => {
    if (!trackRef.current) return;
    const pos = getPositionMs();
    const willPause = !clock.current.paused;
    setClock(pos, willPause);
    if (useBrowser) await playerRef.current?.togglePlay().catch(() => {});
    else if (!(await control({ action: willPause ? "pause" : "resume" }))) setClock(pos, !willPause);
  }, [useBrowser, control, getPositionMs, setClock]);

  const skip = useCallback(async (deltaMs: number) => seek(getPositionMs() + deltaMs), [seek, getPositionMs]);

  const trackId = track?.id ?? null;
  const results = useMemo(() => searchContext?.results ?? [], [searchContext]);
  const mentions = useMemo(
    () => (trackId == null ? [] : (results.find((r) => r.trackId === trackId)?.times ?? [])),
    [trackId, results],
  );
  const resultIndex = trackId == null ? -1 : results.findIndex((r) => r.trackId === trackId);

  const goSong = useCallback(
    async (dir: 1 | -1) => {
      const target = resultIndex === -1 ? (dir > 0 ? results[0] : undefined) : results[resultIndex + dir];
      if (target) await play(target.trackId, target.times[0] ?? null, `${target.trackId}:nav`);
    },
    [resultIndex, results, play],
  );

  const next = useCallback(async () => {
    const m = nextMention(mentions, getPositionMs());
    if (m != null) await seek(m - PREROLL_MS);
    else await goSong(1);
  }, [mentions, getPositionMs, seek, goSong]);

  const prev = useCallback(async () => {
    const m = prevMention(mentions, getPositionMs());
    if (m != null) await seek(m - PREROLL_MS);
    else await goSong(-1);
  }, [mentions, getPositionMs, seek, goSong]);

  const canNext = !!track && (mentions.length > 0 || (results.length > 0 && resultIndex < results.length - 1));
  const canPrev = !!track && (mentions.length > 0 || resultIndex > 0);

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v));
      volumeRef.current = clamped;
      setVolumeState(clamped);
      writeStored("spotifyVolume", String(clamped));
      if (useBrowser) {
        void playerRef.current?.setVolume(clamped).catch(() => {});
      } else {
        if (volumeTimer.current) clearTimeout(volumeTimer.current);
        volumeTimer.current = setTimeout(() => void control({ action: "volume", volumePercent: clamped * 100 }), 300);
      }
    },
    [useBrowser, control],
  );

  const logout = useCallback(async () => {
    await fetch("/api/spotify/logout", { method: "POST" });
    playerRef.current?.disconnect();
    playerRef.current = null;
    setBrowserDeviceId(null);
    setTrack(null);
    setClock(0, true);
    setStatus((s) => (s ? { ...s, connected: false, displayName: null, product: null } : s));
  }, [setClock]);

  return (
    <Ctx.Provider
      value={{
        status,
        browserDeviceId,
        sdkError,
        selectedDevice,
        setSelectedDevice,
        devices,
        loadDevices,
        message,
        flash,
        playingKey,
        track,
        paused,
        durationMs,
        volume,
        setVolume,
        searchContext,
        setSearchContext,
        mentions,
        canPrev,
        canNext,
        play,
        togglePlay,
        seek,
        skip,
        prev,
        next,
        getPositionMs,
        palette,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
