"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSpotify } from "@/components/spotify/SpotifyProvider";

const textBtn = "border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:underline";

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
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
      {status?.connected && !status.searchBlockedUntil && unlinked > 0 && (
        <button type="button" onClick={() => retry("spotify")} className={textBtn}>
          Vincular {unlinked} con Spotify
        </button>
      )}
      {retryable > 0 && (
        <button type="button" onClick={() => retry("fetch")} className={textBtn}>
          Reintentar {retryable} sin letra
        </button>
      )}
      {confirming ? (
        <>
          <button type="button" onClick={remove} className={`${textBtn} text-warn`}>
            Sí, borrar
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={`${textBtn} text-secondary`}>
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={`${textBtn} text-warn`}>
          Borrar
        </button>
      )}
      {msg && <span className="text-xs text-secondary">{msg}</span>}
    </div>
  );
}
