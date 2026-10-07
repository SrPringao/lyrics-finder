"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePositionMs, usePrefersReducedMotion, useSpotify } from "@/components/spotify/SpotifyProvider";
import { highlightTerms } from "@/lib/player/highlight";
import { currentLineIndex } from "@/lib/player/timing";

const LH = 80;

function Line({ text }: { text: string }) {
  const { searchContext } = useSpotify();
  const segs = searchContext ? highlightTerms(text, searchContext.q, searchContext.mode) : [{ text, hit: false }];
  return (
    <span className="line-clamp-2">
      {segs.map((s, i) =>
        s.hit ? (
          // Solo el color de la fuente, con el acento del tinte (sin fondo ni subrayado).
          <span key={i} className="text-tint-accent">
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

/** Letra sincronizada: la línea actual en el segundo renglón, las demás desvanecidas. */
export function LyricsScroller() {
  const { track, seek } = useSpotify();
  const pos = usePositionMs(100);
  const reduced = usePrefersReducedMotion();
  const lines = track?.lines ?? [];
  const synced = lines.some((l) => l.t != null);

  if (!track) return <div className="min-h-0 flex-grow" />;

  if (track.lyricsStatus === "instrumental") {
    return <p className="min-h-0 flex-grow text-[30px] font-bold leading-[1.18] tracking-[-0.02em]">Esta canción es instrumental.</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="min-h-0 flex-grow text-[15px] text-tint-secondary">
        {track.id == null ? (
          "Esta canción no está en tu biblioteca."
        ) : (
          <>
            No hay letra para esta canción.{" "}
            <Link href={`/cancion/${track.id}`} className="font-semibold text-tint-ink underline">
              Pegar letra
            </Link>
          </>
        )}
      </div>
    );
  }

  if (!synced) {
    // Sin tiempos: estática, con scroll.
    return (
      <div className="lyr min-h-0 flex-grow overflow-y-auto py-6">
        {lines.map((l) => (
          <p key={l.i} className="py-2 text-[30px] font-bold leading-[1.18] tracking-[-0.02em]">
            <Line text={l.text} />
          </p>
        ))}
      </div>
    );
  }

  return <SyncedLyrics lines={lines} pos={pos} reduced={reduced} seek={seek} />;
}

/** Sin tocar nada durante este tiempo, la letra vuelve a seguir a la canción. */
const RESUME_MS = 4000;

/**
 * Letra sincronizada. Sigue sola a la canción; con la rueda, el trackpad o arrastrando se
 * puede recorrer completa, y al picar una línea la canción salta ahí y vuelve a seguirla.
 */
function SyncedLyrics({
  lines,
  pos,
  reduced,
  seek,
}: {
  lines: { i: number; t: number | null; text: string }[];
  pos: number;
  reduced: boolean;
  seek: (ms: number) => Promise<void>;
}) {
  const idx = currentLineIndex(lines, pos);
  const autoOffset = LH - idx * LH;
  const minOffset = LH - (lines.length - 1) * LH;

  // null = sigue a la canción; un número = el usuario está recorriendo la letra.
  const [manualOffset, setManualOffset] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ id: number; y: number; from: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const clamp = (v: number) => Math.min(LH, Math.max(minOffset, v));
  const scheduleResume = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setManualOffset(null), RESUME_MS);
  };
  const follow = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setManualOffset(null);
  };

  const manual = manualOffset !== null;
  const offset = manualOffset ?? autoOffset;
  const transition = reduced || dragging ? "none" : manual ? "transform 160ms ease-out" : "transform 700ms cubic-bezier(0.22, 0.8, 0.2, 1)";

  return (
    <div className="relative min-h-0 flex-grow">
      <div
        className="lyr absolute inset-0 touch-none overflow-hidden select-none"
        onWheel={(e) => {
          setManualOffset((prev) => clamp((prev ?? autoOffset) - e.deltaY));
          scheduleResume();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          drag.current = { id: e.pointerId, y: e.clientY, from: manualOffset ?? autoOffset, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.abs(dy) < 6) return;
          if (!d.moved) {
            d.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }
          setManualOffset(clamp(d.from + dy));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d?.moved) return;
          // Fue un arrastre, no un clic: que la línea bajo el dedo no salte.
          suppressClick.current = true;
          setTimeout(() => (suppressClick.current = false), 0);
          e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          scheduleResume();
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
          scheduleResume();
        }}
      >
        <div style={{ transform: `translateY(${offset}px)`, transition }}>
          {lines.map((l, k) => {
            const d = Math.abs(k - idx);
            // Recorriendo la letra, todas se leen; siguiendo la canción, se desvanecen por distancia.
            const opacity = d === 0 ? 1 : manual ? 0.55 : d === 1 ? 0.4 : d === 2 ? 0.24 : 0.14;
            const scale = d === 0 || manual ? 1 : 0.97;
            return (
              <button
                key={l.i}
                type="button"
                disabled={l.t == null}
                onClick={() => {
                  if (suppressClick.current || l.t == null) return;
                  follow();
                  void seek(l.t);
                }}
                aria-current={d === 0 ? "true" : undefined}
                title={l.t != null ? "Ir a esta parte" : undefined}
                className="flex h-20 w-full items-center p-0 text-left text-[30px] font-bold leading-[1.18] tracking-[-0.02em] text-tint-ink hover:opacity-100 focus-visible:opacity-100"
                style={{
                  opacity,
                  transform: `scale(${scale})`,
                  transformOrigin: "left center",
                  transition: reduced ? "opacity 600ms ease" : "opacity 600ms ease, transform 600ms ease",
                }}
              >
                <Line text={l.text} />
              </button>
            );
          })}
        </div>
      </div>
      {manual && (
        <button
          type="button"
          onClick={follow}
          className="absolute right-0 bottom-1 z-10 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-tint-ink shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
        >
          Volver a la línea actual
        </button>
      )}
    </div>
  );
}
