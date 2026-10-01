"use client";

import Link from "next/link";
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

  const idx = currentLineIndex(lines, pos);
  return (
    <div className="lyr relative min-h-0 flex-grow overflow-hidden">
      <div
        style={{
          transform: `translateY(${LH - idx * LH}px)`,
          transition: reduced ? "none" : "transform 700ms cubic-bezier(0.22, 0.8, 0.2, 1)",
        }}
      >
        {lines.map((l, k) => {
          const d = Math.abs(k - idx);
          const opacity = d === 0 ? 1 : d === 1 ? 0.4 : d === 2 ? 0.24 : 0.14;
          return (
            <button
              key={l.i}
              type="button"
              disabled={l.t == null}
              onClick={() => l.t != null && void seek(l.t)}
              aria-current={d === 0 ? "true" : undefined}
              className="flex h-20 w-full items-center p-0 text-left text-[30px] font-bold leading-[1.18] tracking-[-0.02em] text-tint-ink"
              style={{
                opacity,
                transform: `scale(${d === 0 ? 1 : 0.97})`,
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
  );
}
