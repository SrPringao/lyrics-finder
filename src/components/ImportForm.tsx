"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface Progress {
  id: number;
  name: string;
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

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    playlistId: number;
    name: string;
    trackCount: number;
    source: string;
    skipped: number;
    withIsrc: number;
  } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
    if (!name) setName(f.name.replace(/\.(csv|txt|tsv)$/i, ""));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al importar");
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  // Polling del progreso cada segundo hasta que no quede nada pendiente.
  useEffect(() => {
    if (!info) return;
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/playlists/${info!.playlistId}`, { cache: "no-store" });
        if (res.ok) {
          const p: Progress = await res.json();
          if (stop) return;
          setProgress(p);
          if (!p.running && p.pending === 0) {
            setBusy(false);
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
  }, [info]);

  const done = progress ? progress.total - progress.pending : 0;
  const pct = progress && progress.total ? Math.round((done / progress.total) * 100) : 0;
  const finished = progress && !progress.running && progress.pending === 0;

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files[0]);
          }}
          role="button"
          tabIndex={0}
          aria-label="Elegir archivo de playlist"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed px-6 py-12 text-center transition ${
            dragging ? "border-accent bg-tint" : "border-input-underline hover:border-secondary"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {file ? (
            <>
              <p className="text-[15px] font-semibold">{file.name}</p>
              <p className="text-[13px] text-secondary">{(file.size / 1024).toFixed(1)} KB · haz clic para cambiar</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-semibold">Arrastra aquí tu archivo</p>
              <p className="text-[13px] text-secondary">o haz clic para elegirlo · .csv (Spotify) o .txt (Apple Music)</p>
            </>
          )}
        </div>

        <label className="block">
          <span className="text-[13px] text-secondary">Nombre de la playlist</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mis favoritas"
            className="mt-1 w-full border-0 border-b border-input-underline bg-transparent px-0 pt-1 pb-2 text-[17px] font-semibold text-ink outline-none focus:border-accent"
          />
        </label>

        {error && (
          <p className="flex items-center gap-1.5 text-[13px] text-warn">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!file || busy}
          className="self-start rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Importando…" : "Importar"}
        </button>
      </form>

      {info && (
        <section className="flex flex-col gap-3 border-t border-hairline pt-6">
          <p className="text-[13px] text-secondary">
            <span className="font-semibold text-ink">{info.name}</span>: {info.trackCount} canciones leídas ({SOURCE_LABEL[info.source] ?? info.source})
            {info.withIsrc > 0 && ` · ${info.withIsrc} con ISRC`}
            {info.skipped > 0 && ` · ${info.skipped} filas sin título ignoradas`}
          </p>
          {progress && (
            <>
              {progress.phase === "spotify" && (
                <p className="text-[13px] text-secondary">
                  Vinculando con Spotify: {progress.spotify_matched + progress.spotify_not_found}/{progress.total}… (después
                  siguen las letras)
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
                  Spotify: {progress.spotify_matched} vinculadas, {progress.spotify_not_found} no encontradas
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
      )}
    </div>
  );
}
