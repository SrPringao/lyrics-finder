"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDownIcon, SearchIcon } from "@/components/Icons";

type Mode = "palabra" | "contiene";

const pill = "rounded-full border-0 px-[13px] py-1.5";

export function SearchBar({
  q,
  mode,
  playlistId,
  playlists,
  summary,
}: {
  q: string;
  mode: Mode;
  playlistId: number | null;
  playlists: { id: number; name: string }[];
  summary: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(q);

  const go = (next: { q?: string; mode?: Mode; playlist?: number | null }) => {
    const qs = new URLSearchParams();
    const query = (next.q ?? text).trim();
    if (query) qs.set("q", query);
    qs.set("modo", next.mode ?? mode);
    const pl = next.playlist === undefined ? playlistId : next.playlist;
    if (pl) qs.set("playlist", String(pl));
    router.push(`/buscar?${qs}`);
  };

  return (
    <div className="flex flex-col gap-[14px]">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: text });
        }}
        className="flex items-center gap-3 border-b border-input-underline pb-2.5 text-secondary"
      >
        <SearchIcon />
        <label htmlFor="q" className="sr-only">
          Buscar en las letras
        </label>
        <input
          id="q"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          autoComplete="off"
          placeholder="Busca una palabra o “una frase”"
          className="min-w-0 flex-grow border-0 bg-transparent p-0 text-[30px] font-bold tracking-[-0.03em] text-ink outline-none placeholder:text-disabled"
        />
      </form>

      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {(
          [
            ["palabra", "Palabra completa", "“madrid” encuentra Madrid, pero “madri” no"],
            ["contiene", "Contiene el texto", "“madri” también encuentra Madrid (mínimo 3 letras)"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            title={hint}
            onClick={() => go({ mode: value })}
            className={`${pill} ${mode === value ? "bg-ink text-white" : "bg-pill text-ink"}`}
          >
            {label}
          </button>
        ))}
        <label className="relative">
          <span className="sr-only">Playlist</span>
          <select
            value={playlistId ?? ""}
            onChange={(e) => go({ playlist: e.target.value ? Number(e.target.value) : null })}
            className={`${pill} max-w-56 cursor-pointer appearance-none truncate bg-pill pr-[30px] text-ink`}
          >
            <option value="">Todas las playlists</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-[13px] -translate-y-1/2 text-ink" />
        </label>
        {summary && <span className="ml-auto text-secondary">{summary}</span>}
      </div>
    </div>
  );
}
