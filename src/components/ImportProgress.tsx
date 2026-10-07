"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface ImportInfo {
  playlistId: number;
  name: string;
  trackCount: number;
  source: string;
  skipped: number;
  withIsrc: number;
}

interface Progress {
  total: number;
  synced: number;
  plain: number;
  instrumental: number;
  not_found: number;
  error: number;
  pending: number;
  spotify_matched: number;
  spotify_not_found: number;
  running: boolean;
  phase: "spotify" | "lyrics" | null;
}

const SOURCE_LABEL: Record<string, string> = { spotify: "Spotify", apple: "Apple Music", csv: "CSV" };

/** Progreso de una importación: consulta la playlist cada segundo hasta que no quede nada pendiente. */
export function ImportProgress({ info, onDone }: { info: ImportInfo; onDone?: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/playlists/${info.playlistId}`, { cache: "no-store" });
        if (res.ok) {
          const p: Progress = await res.json();
          if (stop) return;
          setProgress(p);
          if (!p.running && p.pending === 0) {
            doneRef.current?.();
            return;
          }
        }
      } catch {
        // seguimos intentando
      }
      if (!stop) setTimeout(tick, 1000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [info.playlistId]);

  const done = progress ? progress.total - progress.pending : 0;
  const pct = progress && progress.total ? Math.round((done / progress.total) * 100) : 0;
  const finished = progress && !progress.running && progress.pending === 0;

  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-6">
      <p className="text-[13px] text-secondary">
        <span className="font-semibold text-ink">{info.name}</span>: {info.trackCount} canciones leídas ({SOURCE_LABEL[info.source] ?? info.source})
        {info.withIsrc > 0 && ` · ${info.withIsrc} con ISRC`}
        {info.skipped > 0 && ` · ${info.skipped} ${info.source === "spotify" ? "omitidas (archivos locales o episodios)" : "filas sin título ignoradas"}`}
      </p>
      {progress && (
        <>
          {progress.phase === "spotify" && (
            <p className="text-[13px] text-secondary">
              Vinculando con Spotify: {progress.spotify_matched + progress.spotify_not_found}/{progress.total}… (después siguen
              las letras)
            </p>
          )}
          <div className="h-1 overflow-hidden rounded-[4px] bg-pill">
            <div className="h-1 rounded-[4px] bg-accent transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] text-secondary">
            <span className="font-semibold text-ink">
              Letras: {done}/{progress.total}
            </span>{" "}
            — {progress.synced} sincronizadas, {progress.plain} sin tiempos, {progress.instrumental} instrumentales,{" "}
            {progress.not_found} no encontradas
            {progress.error > 0 && `, ${progress.error} con error`}
          </p>
          {progress.spotify_matched + progress.spotify_not_found > 0 && (
            <p className="text-[13px] text-secondary">
              Spotify: {progress.spotify_matched} vinculadas
              {progress.spotify_not_found > 0 && `, ${progress.spotify_not_found} no encontradas`}
            </p>
          )}
          {finished && (
            <div className="flex flex-wrap gap-2 pt-2 text-[13px]">
              <Link href="/buscar" className="rounded-full bg-ink px-[13px] py-1.5 text-white">
                Buscar en las letras
              </Link>
              <Link href={`/biblioteca/${info.playlistId}`} className="rounded-full bg-pill px-[13px] py-1.5 text-ink hover:bg-hairline">
                Ver canciones
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
