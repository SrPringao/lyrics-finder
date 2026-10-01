"use client";

import Link from "next/link";
import { PlayIcon, SpinnerIcon } from "@/components/Icons";
import { formatTime } from "@/lib/parsers/lrc";
import { useSpotify } from "./SpotifyProvider";

/**
 * Timestamp clicable: con Spotify conectado reproduce la canción desde ese segundo;
 * sin sesión, lleva a la línea dentro de la letra.
 */
export function PlayButton({
  trackId,
  timeMs,
  lineIndex,
  label,
  className = "",
}: {
  trackId: number;
  timeMs: number | null;
  lineIndex?: number;
  label?: string;
  className?: string;
}) {
  const { status, play, playingKey } = useSpotify();
  const key = `${trackId}:${lineIndex ?? "start"}`;
  const text = label ?? (timeMs == null ? "—" : formatTime(timeMs));

  if (!status?.connected) {
    if (lineIndex == null) return null;
    return (
      <Link href={`/cancion/${trackId}#l${lineIndex}`} className={`font-mono text-xs text-emerald-700 hover:underline ${className}`}>
        {text}
      </Link>
    );
  }

  const busy = playingKey === key;
  return (
    <button
      onClick={() => play(trackId, timeMs, key)}
      disabled={busy}
      title={timeMs == null ? "Reproducir desde el inicio" : `Reproducir desde ${formatTime(timeMs)}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 ${className}`}
    >
      {busy ? <SpinnerIcon /> : <PlayIcon />}
      {text}
    </button>
  );
}
