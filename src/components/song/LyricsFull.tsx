"use client";

import { usePositionMs, useSpotify } from "@/components/spotify/SpotifyProvider";
import { formatTime } from "@/lib/parsers/lrc";
import { currentLineIndex } from "@/lib/player/timing";

/**
 * Letra completa de una canción. Si es la que suena, la línea actual se resalta; con Spotify
 * conectado, cada línea con tiempo reproduce (o salta) a ese momento.
 */
export function LyricsFull({ trackId, lines }: { trackId: number; lines: { i: number; t: number | null; text: string }[] }) {
  const { status, track, play, seek } = useSpotify();
  const isCurrent = track?.id === trackId;
  const pos = usePositionMs(isCurrent ? 100 : 60_000);
  const synced = lines.some((l) => l.t != null);
  const current = isCurrent && synced ? currentLineIndex(lines, pos) : -1;
  const connected = !!status?.connected;

  return (
    <ol className="flex flex-col">
      {lines.map((l, k) => {
        const active = k === current;
        const cls = `block w-full py-1.5 text-left text-[22px] font-bold leading-[1.18] tracking-[-0.02em] lg:text-[30px] ${
          current >= 0 && !active ? "opacity-40" : ""
        } ${active ? "text-accent" : "text-ink"}`;
        return (
          <li key={l.i} id={`l${l.i}`} className="transition-opacity duration-[600ms]">
            {connected && l.t != null ? (
              <button
                type="button"
                title={`Reproducir desde ${formatTime(l.t)}`}
                onClick={() => (isCurrent ? void seek(l.t!) : void play(trackId, l.t, `${trackId}:${l.i}`))}
                className={`${cls} hover:opacity-100`}
              >
                {l.text}
              </button>
            ) : (
              <span className={cls}>{l.text}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
