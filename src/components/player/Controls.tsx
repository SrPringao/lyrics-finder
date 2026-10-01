"use client";

import { BackTenIcon, ForwardTenIcon, NextMentionIcon, PauseGlyph, PlayGlyph, PrevMentionIcon, VolumeHighIcon, VolumeLowIcon } from "@/components/Icons";
import { useSpotify } from "@/components/spotify/SpotifyProvider";

const btn = "flex h-11 w-11 items-center justify-center border-0 bg-transparent text-inherit disabled:opacity-35 disabled:cursor-default";

export function Controls() {
  const { track, paused, togglePlay, skip, prev, next, canPrev, canNext, searchContext, mentions } = useSpotify();
  const disabled = !track;
  const byMention = mentions.length > 0 || !searchContext;
  return (
    <div className="flex items-center justify-between text-tint-ink">
      <button type="button" aria-label="Retroceder 10 segundos" disabled={disabled} onClick={() => void skip(-10_000)} className={btn}>
        <BackTenIcon />
      </button>
      <button
        type="button"
        aria-label={byMention ? "Mención anterior" : "Canción anterior de los resultados"}
        disabled={!canPrev}
        onClick={() => void prev()}
        className={btn}
      >
        <PrevMentionIcon />
      </button>
      <button
        type="button"
        aria-label={paused ? "Reproducir" : "Pausar"}
        disabled={disabled}
        onClick={() => void togglePlay()}
        className="flex h-14 w-14 items-center justify-center rounded-full border-0 bg-transparent text-tint-ink disabled:opacity-35"
      >
        {paused ? <PlayGlyph /> : <PauseGlyph />}
      </button>
      <button
        type="button"
        aria-label={byMention ? "Mención siguiente" : "Canción siguiente de los resultados"}
        disabled={!canNext}
        onClick={() => void next()}
        className={btn}
      >
        <NextMentionIcon />
      </button>
      <button type="button" aria-label="Adelantar 10 segundos" disabled={disabled} onClick={() => void skip(10_000)} className={btn}>
        <ForwardTenIcon />
      </button>
    </div>
  );
}

export function VolumeSlider() {
  const { volume, setVolume } = useSpotify();
  return (
    <div className="flex items-center gap-2.5 text-tint-secondary">
      <VolumeLowIcon />
      <div className="relative h-1 flex-grow rounded-[4px] bg-[color-mix(in_srgb,var(--color-tint-ink)_14%,transparent)]">
        <div className="h-1 rounded-[4px] bg-tint-ink" style={{ width: `${Math.round(volume * 100)}%` }} />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.currentTarget.value) / 100)}
          aria-label="Volumen"
          className="absolute inset-x-0 -top-2 h-5 w-full cursor-pointer opacity-0"
        />
      </div>
      <VolumeHighIcon />
    </div>
  );
}
