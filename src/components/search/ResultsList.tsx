"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Cover } from "@/components/Cover";
import { PlayIcon } from "@/components/Icons";
import { usePositionMs, useSpotify } from "@/components/spotify/SpotifyProvider";
import { PREROLL_MS } from "@/lib/player/timing";
import { formatTime } from "@/lib/parsers/lrc";
import { splitHighlighted, type TrackHits } from "@/lib/search/fts";

export interface ResultTrack extends Omit<TrackHits, "hits"> {
  hits: { lineId: number; lineIndex: number; timeMs: number | null; highlighted: string }[];
  /** Línea con mejor relevancia, para la fila compacta. */
  best: string;
}

const mono = "font-mono text-xs";

function Snippet({ text, accentClass }: { text: string; accentClass: string }) {
  return (
    <>
      {splitHighlighted(text).map((s, i) =>
        s.mark ? (
          <span key={i} className={`font-semibold ${accentClass}`}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** Un tiempo: con Spotify reproduce desde ahí; sin Spotify lleva a la línea en la letra. */
function TimeButton({
  track,
  hit,
  className,
}: {
  track: ResultTrack;
  hit: ResultTrack["hits"][number];
  className: string;
}) {
  const { status, play, playingKey } = useSpotify();
  const key = `${track.trackId}:${hit.lineIndex}`;
  const label = hit.timeMs == null ? null : formatTime(hit.timeMs);
  if (!status?.connected) {
    return (
      <Link href={`/cancion/${track.trackId}#l${hit.lineIndex}`} className={className}>
        {label ?? "Ver"}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void play(track.trackId, hit.timeMs, key)}
      aria-label={label ? `Reproducir ${track.title} desde ${label}` : `Reproducir ${track.title} desde el inicio`}
      className={`${className} ${playingKey === key ? "opacity-50" : ""}`}
    >
      {label ?? <PlayIcon className="h-2.5 w-2.5" />}
    </button>
  );
}

function CompactRow({ t }: { t: ResultTrack }) {
  const timed = t.hits.filter((h) => h.timeMs != null);
  const shown = (timed.length ? timed : t.hits.slice(0, 1)).slice(0, 2);
  const extra = t.hits.length - shown.length;
  return (
    <div className="grid h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[14px] border-b border-hairline sm:grid-cols-[44px_minmax(0,1fr)_150px]">
      <Cover url={t.coverUrl} size={44} radius={6} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          <Link href={`/cancion/${t.trackId}`} className="hover:underline">
            {t.title}
          </Link>{" "}
          <span className="font-normal text-secondary">· {t.artist}</span>
        </div>
        <div className="truncate text-[13px] text-snippet">
          <Snippet text={t.best} accentClass="text-accent" />
        </div>
      </div>
      <div className="flex items-center justify-end">
        {shown.map((h) => (
          <TimeButton key={h.lineId} track={t} hit={h} className={`border-0 bg-transparent px-1.5 py-1 text-accent ${mono}`} />
        ))}
        {extra > 0 && <span className="px-1.5 text-xs text-secondary">+{extra}</span>}
      </div>
    </div>
  );
}

/** La canción que suena: expandida, con todos sus tiempos como chips. */
function ExpandedRow({ t }: { t: ResultTrack }) {
  const pos = usePositionMs(250);
  const timed = t.hits.filter((h) => h.timeMs != null);
  // El chip "que suena": la última mención que ya empezó (la reproducción arranca 1.5 s antes).
  const active = [...timed].reverse().find((h) => h.timeMs! - PREROLL_MS <= pos + 250)?.lineId;
  return (
    <div className="-mx-4 mt-2 mb-1 flex flex-col gap-2.5 rounded-[14px] bg-tint px-4 py-[14px] text-tint-ink">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[14px]">
        <Cover url={t.coverUrl} size={44} radius={6} placeholderClassName="bg-white/50 text-tint-secondary" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            <Link href={`/cancion/${t.trackId}`} className="hover:underline">
              {t.title}
            </Link>{" "}
            <span className="font-normal text-tint-secondary">· {t.artist}</span>
          </div>
          <div className="truncate text-[13px]">
            <Snippet text={t.best} accentClass="text-tint-accent" />
          </div>
        </div>
        <span className="text-xs font-semibold text-tint-accent">
          {t.hits.length} {t.hits.length === 1 ? "mención" : "menciones"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-[58px]">
        {(timed.length ? timed : t.hits).map((h) => (
          <TimeButton
            key={h.lineId}
            track={t}
            hit={h}
            className={`rounded-[6px] border-0 px-[9px] py-1 ${mono} ${
              h.lineId === active ? "bg-tint-accent text-white" : "bg-white text-tint-accent shadow-[0_0_0_1px_var(--color-tint-chip)]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function ResultsList({
  tracks,
  context,
}: {
  tracks: ResultTrack[];
  /** Todas las canciones del resultado (no solo esta página), para el reproductor. */
  context: { q: string; mode: "palabra" | "contiene"; results: { trackId: number; times: number[] }[] };
}) {
  const { track, setSearchContext } = useSpotify();
  const ctxKey = useMemo(() => JSON.stringify(context), [context]);

  useEffect(() => {
    setSearchContext(JSON.parse(ctxKey));
  }, [ctxKey, setSearchContext]);

  return (
    <div className="flex flex-col">
      {tracks.map((t) => (t.trackId === track?.id ? <ExpandedRow key={t.trackId} t={t} /> : <CompactRow key={t.trackId} t={t} />))}
    </div>
  );
}
