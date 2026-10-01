"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/Icons";
import { BROWSER_DEVICE, useSpotify } from "./SpotifyProvider";

interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
}

export function SpotifyBar() {
  const { status, browserDeviceId, sdkError, selectedDevice, setSelectedDevice, nowPlaying, message, togglePause, logout } = useSpotify();
  const pathname = usePathname();
  const [devices, setDevices] = useState<Device[]>([]);

  const loadDevices = useCallback(() => {
    fetch("/api/spotify/devices", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { devices: [] }))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status?.connected) loadDevices();
  }, [status?.connected, loadDevices]);

  if (!status) return null;

  // Otros dispositivos (el del navegador ya aparece como "Este navegador").
  const others = devices.filter((d) => d.id && d.id !== browserDeviceId && !d.is_restricted);
  const selectedMissing = selectedDevice !== BROWSER_DEVICE && !others.some((d) => d.id === selectedDevice);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {!status.connected ? (
        <a
          href={status.configured ? `/api/spotify/login?next=${encodeURIComponent(pathname)}` : "/spotify"}
          className="rounded-full bg-[#1DB954] px-3 py-1 font-medium text-white hover:bg-[#1aa34a]"
        >
          Conectar Spotify
        </a>
      ) : (
        <>
          {nowPlaying && selectedDevice === BROWSER_DEVICE && (
            <button
              onClick={togglePause}
              className="hidden max-w-56 items-center gap-1.5 truncate rounded-full border border-stone-200 bg-white px-2.5 py-1 hover:bg-stone-50 sm:inline-flex"
              title={nowPlaying.paused ? "Reanudar" : "Pausar"}
            >
              {nowPlaying.paused ? <PlayIcon /> : <PauseIcon />}
              <span className="truncate">
                {nowPlaying.name} — {nowPlaying.artist}
              </span>
            </button>
          )}
          <select
            value={selectedMissing ? BROWSER_DEVICE : selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            onFocus={loadDevices}
            className="max-w-44 rounded-full border border-stone-300 bg-white px-2 py-1"
            title="Dónde se reproduce"
          >
            <option value={BROWSER_DEVICE}>
              Este navegador{browserDeviceId ? "" : sdkError ? " (no disponible)" : " (conectando…)"}
            </option>
            {others.map((d) => (
              <option key={d.id} value={d.id!}>
                {d.name}
                {d.type === "Smartphone" ? " (celular)" : d.type === "Computer" ? " (computadora)" : ` (${d.type.toLowerCase()})`}
              </option>
            ))}
          </select>
          <span className="hidden text-stone-500 md:inline" title={status.product === "premium" ? "" : "La reproducción requiere Premium"}>
            {status.displayName ?? "Spotify"}
            {status.product && status.product !== "premium" && " (no Premium)"}
          </span>
          <button onClick={logout} className="text-stone-400 hover:text-stone-700" title="Cerrar sesión de Spotify">
            Salir
          </button>
        </>
      )}

      {message && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${
            message.error ? "bg-red-600 text-white" : "bg-stone-900 text-white"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
