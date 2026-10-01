"use client";

import { PlayIcon, SpinnerIcon } from "@/components/Icons";
import { useSpotify } from "./SpotifyProvider";

/** Botón para reproducir una canción (desde un tiempo o desde el inicio). Solo con Spotify conectado. */
export function PlayButton({
  trackId,
  timeMs = null,
  label,
  variant = "pill",
}: {
  trackId: number;
  timeMs?: number | null;
  label?: string;
  variant?: "pill" | "icon";
}) {
  const { status, play, playingKey } = useSpotify();
  if (!status?.connected) return null;
  const key = `${trackId}:start`;
  const busy = playingKey === key;
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void play(trackId, timeMs, key)}
        disabled={busy}
        aria-label="Reproducir"
        className="flex h-11 w-11 items-center justify-center rounded-full text-accent hover:bg-pill disabled:opacity-50"
      >
        {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : <PlayIcon className="h-3.5 w-3.5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void play(trackId, timeMs, key)}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-ink px-[13px] py-1.5 text-[13px] text-white disabled:opacity-50"
    >
      {busy ? <SpinnerIcon /> : <PlayIcon />}
      {label ?? "Reproducir"}
    </button>
  );
}
