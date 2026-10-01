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
      <div className="flex flex-wrap gap-2 text-sm">
        <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50">
          {open ? "Cerrar editor" : initialText ? "Editar letra" : "Pegar letra"}
        </button>
        <button
          onClick={() => call("fetch")}
          disabled={busy !== null}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 hover:bg-stone-50 disabled:opacity-40"
        >
          {busy === "fetch" ? "Buscando…" : "Buscar de nuevo en LRCLIB"}
        </button>
        {msg && <span className="self-center text-stone-600">{msg}</span>}
      </div>

      {open && (
        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-stone-500">
            Pega texto normal, o formato LRC (<code>[01:23.45] línea</code>) para guardarla con tiempos. Déjalo vacío y guarda
            para borrarla.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="w-full rounded-md border border-stone-300 p-3 font-mono text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={() => call("save")}
            disabled={busy !== null}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            {busy === "save" ? "Guardando…" : "Guardar letra"}
          </button>
        </div>
      )}
    </div>
  );
}
