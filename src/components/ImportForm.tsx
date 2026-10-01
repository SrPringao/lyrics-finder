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
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
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
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
            dragging ? "border-emerald-500 bg-emerald-50" : "border-stone-300 hover:border-stone-400"
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
              <p className="font-medium">{file.name}</p>
              <p className="text-xs text-stone-500">{(file.size / 1024).toFixed(1)} KB · haz clic para cambiar</p>
            </>
          ) : (
            <>
              <p className="font-medium">Arrastra aquí tu archivo</p>
              <p className="text-xs text-stone-500">o haz clic para elegirlo · .csv (Spotify) o .txt (Apple Music)</p>
            </>
          )}
        </div>

        <label className="block">
          <span className="text-sm font-medium">Nombre de la playlist</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mis favoritas"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </label>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {busy ? "Importando…" : "Importar"}
        </button>
      </form>

      {info && (
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-stone-600">
            <strong>{info.name}</strong>: {info.trackCount} canciones leídas ({SOURCE_LABEL[info.source] ?? info.source})
            {info.withIsrc > 0 && ` · ${info.withIsrc} con ISRC`}
            {info.skipped > 0 && ` · ${info.skipped} filas sin título ignoradas`}
          </p>
          {progress && (
            <>
              {progress.phase === "spotify" && (
                <p className="text-sm text-stone-600">
                  Vinculando con Spotify: {progress.spotify_matched + progress.spotify_not_found}/{progress.total}… (después
                  siguen las letras)
                </p>
              )}
              <div className="h-3 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-sm">
                <strong>
                  Letras: {done}/{progress.total}
                </strong>{" "}
                — {progress.synced} sincronizadas, {progress.plain} sin tiempos, {progress.instrumental} instrumentales,{" "}
                {progress.not_found} no encontradas
                {progress.error > 0 && `, ${progress.error} con error`}
              </p>
              {progress.spotify_matched + progress.spotify_not_found > 0 && (
                <p className="text-xs text-stone-500">
                  Spotify: {progress.spotify_matched} vinculadas, {progress.spotify_not_found} no encontradas
                </p>
              )}
              {finished && (
                <div className="flex flex-wrap gap-3 pt-2 text-sm">
                  <Link href="/buscar" className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700">
                    Buscar en las letras
                  </Link>
                  <Link href={`/biblioteca/${info.playlistId}`} className="rounded-md border border-stone-300 px-3 py-1.5 hover:bg-stone-50">
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
