"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const BROWSER_DEVICE = "browser";

interface Status {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  product: string | null;
  searchBlockedUntil?: number | null;
}

interface NowPlaying {
  name: string;
  artist: string;
  paused: boolean;
}

interface SpotifyContextValue {
  status: Status | null;
  browserDeviceId: string | null;
  sdkError: string | null;
  selectedDevice: string;
  setSelectedDevice: (id: string) => void;
  nowPlaying: NowPlaying | null;
  message: { text: string; error: boolean } | null;
  playingKey: string | null;
  play: (trackId: number, timeMs: number | null, key?: string) => Promise<void>;
  togglePause: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SpotifyContextValue | null>(null);

export function useSpotify(): SpotifyContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSpotify fuera de SpotifyProvider");
  return v;
}

function readStored(): string {
  try {
    return localStorage.getItem("spotifyDevice") ?? BROWSER_DEVICE;
  } catch {
    return BROWSER_DEVICE;
  }
}

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [browserDeviceId, setBrowserDeviceId] = useState<string | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDeviceState] = useState<string>(BROWSER_DEVICE);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const playerRef = useRef<Spotify.Player | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), error ? 8000 : 3000);
  }, []);

  // Estado de la sesión + error que pudo regresar del login.
  useEffect(() => {
    fetch("/api/spotify/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: Status) => {
        // El selector de dispositivo solo se muestra cuando ya hay estado, así que se lee aquí.
        setSelectedDeviceState(readStored());
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

  // Reproductor dentro de la página (requiere Premium).
  useEffect(() => {
    if (!status?.connected || status.product !== "premium" || playerRef.current) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!window.Spotify || playerRef.current) return;
      const player = new window.Spotify.Player({
        name: "Letras (navegador)",
        volume: 0.8,
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
      player.addListener("player_state_changed", (s) => {
        if (!s) return;
        const t = s.track_window.current_track;
        setNowPlaying({ name: t.name, artist: t.artists.map((a) => a.name).join(", "), paused: s.paused });
      });
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
  }, [status]);

  const setSelectedDevice = useCallback((id: string) => {
    setSelectedDeviceState(id);
    try {
      localStorage.setItem("spotifyDevice", id);
    } catch {
      // sin almacenamiento: solo dura esta visita
    }
  }, []);

  const play = useCallback(
    async (trackId: number, timeMs: number | null, key?: string) => {
      const useBrowser = selectedDevice === BROWSER_DEVICE;
      if (useBrowser) {
        if (!browserDeviceId) {
          flash(sdkError ?? "El reproductor del navegador todavía se está conectando… o elige otro dispositivo arriba.", true);
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
        // La canción se acaba de vincular (o se marcó como no disponible): refresca las etiquetas.
        if (data.newlyLinked || res.headers.get("x-track-updated")) router.refresh();
      } catch (err) {
        flash(err instanceof Error ? err.message : String(err), true);
      } finally {
        setPlayingKey(null);
      }
    },
    [selectedDevice, browserDeviceId, sdkError, flash, router],
  );

  const togglePause = useCallback(async () => {
    await playerRef.current?.togglePlay();
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/spotify/logout", { method: "POST" });
    playerRef.current?.disconnect();
    playerRef.current = null;
    setBrowserDeviceId(null);
    setNowPlaying(null);
    setStatus((s) => (s ? { ...s, connected: false, displayName: null, product: null } : s));
  }, []);

  return (
    <Ctx.Provider
      value={{
        status,
        browserDeviceId,
        sdkError,
        selectedDevice,
        setSelectedDevice,
        nowPlaying,
        message,
        playingKey,
        play,
        togglePause,
        logout,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
