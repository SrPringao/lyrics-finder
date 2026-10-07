"use client";

import { useRef, useState } from "react";
import { ImportProgress, type ImportInfo } from "@/components/ImportProgress";

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ImportInfo | null>(null);
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
    setInfo(null);
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

      {info && <ImportProgress key={info.playlistId} info={info} onDone={() => setBusy(false)} />}
    </div>
  );
}
