"use client";

import { useEffect, useState } from "react";
import { Cover } from "@/components/Cover";
import { PauseGlyph, PlayGlyph } from "@/components/Icons";
import { NowPlayingPanel } from "@/components/player/NowPlayingPanel";
import { usePositionMs, useSpotify } from "@/components/spotify/SpotifyProvider";
import { currentLineIndex } from "@/lib/player/timing";

/** Celular: mini reproductor fijo abajo; al tocarlo abre el panel completo. */
export function MiniPlayer() {
  const { status, track, paused, togglePlay } = useSpotify();
  const [open, setOpen] = useState(false);
  const pos = usePositionMs(250);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const lines = track?.lines ?? [];
  const synced = lines.some((l) => l.t != null);
  const line = synced ? lines[currentLineIndex(lines, pos)]?.text : null;
  const subtitle = !status?.connected
    ? "Conecta Spotify para escuchar desde aquí"
    : track
      ? (line ?? track.artist)
      : "Elige un tiempo en los resultados para empezar";

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 flex h-[72px] items-center gap-3 bg-tint px-4 text-tint-ink shadow-[0_-1px_0_rgba(0,0,0,0.04)] lg:hidden">
        <button type="button" aria-label="Abrir reproductor" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Cover url={track?.coverUrl} size={44} radius={6} placeholderClassName="bg-white/50 text-tint-secondary" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{track?.title ?? "Ahora suena"}</span>
            <span className="block truncate text-[13px] text-tint-secondary">{subtitle}</span>
          </span>
        </button>
        {track && (
          <button
            type="button"
            aria-label={paused ? "Reproducir" : "Pausar"}
            onClick={() => void togglePlay()}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-tint-ink"
          >
            {paused ? <PlayGlyph size={28} /> : <PauseGlyph size={28} />}
          </button>
        )}
      </div>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Ahora suena" className="fixed inset-0 z-50 lg:hidden">
          <NowPlayingPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
