"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpotify } from "@/components/spotify/SpotifyProvider";

export function PlaylistActions({
  playlistId,
  retryable,
  unlinked = 0,
  redirectOnDelete,
}: {
  playlistId: number;
  retryable: number;
  unlinked?: number;
  redirectOnDelete?: string;
}) {
  const router = useRouter();
  const { status } = useSpotify();
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function retry(kind: "fetch" | "spotify") {
    setMsg(kind === "spotify" ? "Vinculando con Spotify…" : "Buscando letras…");
    const res = await fetch(`/api/playlists/${playlistId}/${kind}`, { method: "POST" });
    if (!res.ok) {
      setMsg((await res.json()).error ?? "Error");
      return;
    }
    // Refresca un par de veces mientras avanza; la página completa también se puede recargar.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const p = await (await fetch(`/api/playlists/${playlistId}`, { cache: "no-store" })).json();
      router.refresh();
      if (!p.running) break;
    }
    setMsg("Listo.");
  }

  async function remove() {
    const res = await fetch(`/api/playlists/${playlistId}`, { method: "DELETE" });
    if (!res.ok) {
      setMsg((await res.json()).error ?? "No se pudo borrar");
      setConfirming(false);
      return;
    }
    if (redirectOnDelete) router.push(redirectOnDelete);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {status?.connected && !status.searchBlockedUntil && unlinked > 0 && (
        <button onClick={() => retry("spotify")} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 hover:bg-stone-50">
          Vincular {unlinked} con Spotify
        </button>
      )}
      {retryable > 0 && (
        <button onClick={() => retry("fetch")} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 hover:bg-stone-50">
          Reintentar {retryable} sin letra
        </button>
      )}
      {confirming ? (
        <>
          <button onClick={remove} className="rounded-md bg-red-600 px-2.5 py-1 text-white hover:bg-red-700">
            Sí, borrar
          </button>
          <button onClick={() => setConfirming(false)} className="rounded-md border border-stone-300 bg-white px-2.5 py-1">
            Cancelar
          </button>
        </>
      ) : (
        <button onClick={() => setConfirming(true)} className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-red-700 hover:bg-red-50">
          Borrar
        </button>
      )}
      {msg && <span className="text-stone-500">{msg}</span>}
    </div>
  );
}
