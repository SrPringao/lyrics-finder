"use client";

import { useEffect, useRef } from "react";
import { useSpotify } from "@/components/spotify/SpotifyProvider";
import { formatClock } from "@/lib/player/timing";

/**
 * Barra de 4 px con marcas de las menciones. La posición se pinta en cada cuadro escribiendo
 * directo al DOM (sin re-render); el <input type="range"> invisible encima permite arrastrar.
 */
export function ProgressBar() {
  const { getPositionMs, durationMs, mentions, seek, track } = useSpotify();
  const fill = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const scrubbing = useRef(false);
  const duration = durationMs ?? track?.durationMs ?? 0;

  useEffect(() => {
    let raf = 0;
    const paint = () => {
      if (!scrubbing.current) {
        const pos = getPositionMs();
        const pct = duration > 0 ? Math.min(100, (pos / duration) * 100) : 0;
        if (fill.current) fill.current.style.width = `${pct}%`;
        if (now.current) now.current.textContent = formatClock(pos);
        if (input.current) input.current.value = String(Math.round(pos));
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [getPositionMs, duration]);

  const preview = (ms: number) => {
    if (fill.current) fill.current.style.width = `${duration > 0 ? (ms / duration) * 100 : 0}%`;
    if (now.current) now.current.textContent = formatClock(ms);
  };
  const commit = () => {
    if (!scrubbing.current || !input.current) return;
    scrubbing.current = false;
    void seek(Number(input.current.value));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-1 rounded-[4px] bg-[color-mix(in_srgb,var(--color-tint-ink)_14%,transparent)]">
        <div ref={fill} className="h-1 rounded-[4px] bg-tint-ink" style={{ width: "0%" }} />
        {duration > 0 &&
          mentions.map((m) => (
            <div
              key={m}
              className="pointer-events-none absolute -top-[2px] h-2 w-[3px] rounded-[2px] bg-tint-mark"
              style={{ left: `${Math.min(100, (m / duration) * 100)}%` }}
              aria-hidden
            />
          ))}
        <input
          ref={input}
          type="range"
          min={0}
          max={Math.max(1, Math.round(duration))}
          step={1000}
          defaultValue={0}
          disabled={!track || duration <= 0}
          aria-label="Posición en la canción"
          className="absolute inset-x-0 -top-2 h-5 w-full cursor-pointer opacity-0 disabled:cursor-default"
          onPointerDown={() => (scrubbing.current = true)}
          onChange={(e) => {
            scrubbing.current = true;
            preview(Number(e.currentTarget.value));
          }}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-tint-secondary">
        <span ref={now}>0:00</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}
