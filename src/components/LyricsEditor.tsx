"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LyricsEditor({ trackId, initialText, startOpen }: { trackId: number; initialText: string; startOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState<null | "save" | "fetch">(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(kind: "save" | "fetch") {
    setBusy(kind);
    setMsg(null);
    try {
      const res =
        kind === "save"
          ? await fetch(`/api/tracks/${trackId}/lyrics`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text }),
            })
          : await fetch(`/api/tracks/${trackId}/fetch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      if (kind === "save") {
        setOpen(false);
        setMsg("Letra guardada.");
      } else {
        setMsg(
          data.kept
            ? "LRCLIB no encontró nada; se conservó tu letra manual."
            : data.status === "not_found"
              ? "LRCLIB sigue sin encontrarla."
              : "Letra actualizada desde LRCLIB.",
        );
      }
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-full bg-pill px-[13px] py-1.5 text-ink hover:bg-hairline">
          {open ? "Cerrar editor" : initialText ? "Editar letra" : "Pegar letra"}
        </button>
        <button
          type="button"
          onClick={() => call("fetch")}
          disabled={busy !== null}
          className="rounded-full bg-pill px-[13px] py-1.5 text-ink hover:bg-hairline disabled:opacity-40"
        >
          {busy === "fetch" ? "Buscando…" : "Buscar de nuevo en LRCLIB"}
        </button>
        {msg && <span className="text-secondary">{msg}</span>}
      </div>

      {open && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-secondary">
            Pega texto normal, o formato LRC (<code>[01:23.45] línea</code>) para guardarla con tiempos. Déjalo vacío y guarda
            para borrarla.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            aria-label="Letra"
            className="w-full rounded-[14px] border border-input-underline p-4 font-mono text-[13px] text-ink outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => call("save")}
            disabled={busy !== null}
            className="self-start rounded-full bg-ink px-[13px] py-1.5 text-[13px] text-white disabled:opacity-40"
          >
            {busy === "save" ? "Guardando…" : "Guardar letra"}
          </button>
        </div>
      )}
    </div>
  );
}
