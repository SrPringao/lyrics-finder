"use client";

import { useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { CloseIcon, SearchIcon } from "@/components/Icons";
import { ImportProgress, type ImportInfo } from "@/components/ImportProgress";
import { SpotifyCatalog } from "@/components/import/SpotifyCatalog";
import { useSpotify } from "@/components/spotify/SpotifyProvider";

interface Item {
  id: string;
  name: string;
  owner: string;
  total: number;
  coverUrl: string | null;
  readable: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "reconnect" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: Item[] };

const textBtn = "border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:underline disabled:opacity-40 disabled:no-underline";
const login = "/api/spotify/login?next=/importar";

/** Importar desde la cuenta de Spotify: una línea discreta en la página y la lista en un modal. */
export function SpotifyPlaylists({ appPlaylists }: { appPlaylists: { id: number; name: string }[] }) {
  const { status } = useSpotify();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ImportInfo | null>(null);

  // La lista se pide a Spotify solo al abrir el modal (y una vez por visita).
  async function open() {
    dialog.current?.showModal();
    if (state.kind === "ready" || state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const r = await fetch("/api/spotify/playlists", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) return setState({ kind: "error", message: d.error ?? "No pude leer tus playlists." });
      if (d.needsReconnect) return setState({ kind: "reconnect" });
      setState({
        kind: "ready",
        items: [{ id: "liked", name: "Tus me gusta", owner: "Tú", total: d.liked ?? 0, coverUrl: null, readable: true }, ...d.playlists],
      });
    } catch {
      setState({ kind: "error", message: "No pude leer tus playlists." });
    }
  }

  async function importOne(id: string) {
    setBusyId(id);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/spotify/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo importar");
      dialog.current?.close();
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  }

  const needle = filter
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const visible =
    state.kind === "ready"
      ? state.items.filter(
          (p) =>
            !needle ||
            p.name
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .toLowerCase()
              .includes(needle),
        )
      : [];

  return (
    <section className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div>
          <h2 className="text-[17px] font-semibold">Desde tu Spotify</h2>
          <p className="text-[13px] text-secondary">Tus playlists, “Tus me gusta”, o cualquier canción o álbum.</p>
        </div>
        {!status || status.connected ? (
          // Mientras se sabe si hay sesión, el botón aparece deshabilitado (sin parpadear "Conectar").
          <div className="flex flex-wrap items-center gap-2">
            {status?.connected && <SpotifyCatalog playlists={appPlaylists} />}
            <button
              type="button"
              onClick={open}
              disabled={!status}
              className="rounded-full bg-pill px-[13px] py-1.5 text-[13px] text-ink hover:bg-hairline disabled:opacity-40"
            >
              Elegir playlist
            </button>
          </div>
        ) : (
          <a href={login} className="rounded-full bg-spotify px-[13px] py-1.5 text-[13px] font-semibold text-white hover:bg-spotify-hover">
            Conectar Spotify
          </a>
        )}
      </div>

      {info && (
        <div className="pt-4">
          <ImportProgress key={info.playlistId} info={info} onDone={() => setBusyId(null)} />
        </div>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="spotify-dialog-title"
        className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-[14px] bg-white p-0 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop:bg-black/30"
      >
        <div className="flex max-h-[80dvh] flex-col">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
            <h2 id="spotify-dialog-title" className="text-[17px] font-semibold">
              Importar desde Spotify
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => dialog.current?.close()}
              className="-mr-3 flex h-11 w-11 items-center justify-center rounded-full text-secondary hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>

          {state.kind === "ready" && (
            <div className="mx-6 flex items-center gap-2.5 border-b border-input-underline pb-2 text-secondary">
              <SearchIcon size={14} />
              <label htmlFor="spotify-filter" className="sr-only">
                Filtrar playlists
              </label>
              <input
                id="spotify-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar playlists"
                autoComplete="off"
                className="min-w-0 flex-grow border-0 bg-transparent p-0 text-[15px] text-ink outline-none placeholder:text-disabled"
              />
              <span className="shrink-0 text-xs">{visible.length}</span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {state.kind === "loading" && <p className="py-4 text-sm text-secondary">Cargando tus playlists…</p>}
            {state.kind === "error" && (
              <p className="flex items-center gap-1.5 py-4 text-[13px] text-warn">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                {state.message}
              </p>
            )}
            {state.kind === "reconnect" && (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="text-sm text-secondary">Para leer tus playlists, Spotify necesita que vuelvas a dar permiso (una sola vez).</p>
                <a href={login} className="rounded-full bg-spotify px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-spotify-hover">
                  Volver a conectar
                </a>
              </div>
            )}
            {state.kind === "ready" && visible.length === 0 && <p className="py-4 text-sm text-secondary">Ninguna playlist coincide.</p>}
            {visible.map((p) => (
              <div key={p.id} className="grid h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[14px] border-b border-hairline last:border-b-0">
                <Cover url={p.coverUrl} size={44} radius={6} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {p.name} <span className="font-normal text-secondary">· {p.owner}</span>
                  </div>
                  <div className="truncate text-[13px] text-snippet">
                    {p.total} {p.total === 1 ? "canción" : "canciones"}
                    {!p.readable && " · solo se pueden importar tus playlists o las colaborativas"}
                  </div>
                </div>
                {p.readable && p.total > 0 ? (
                  <div className="flex items-center gap-4">
                    <button type="button" disabled={busyId !== null} onClick={() => importOne(p.id)} className={textBtn}>
                      {busyId === p.id ? "Importando…" : "Importar"}
                    </button>
                    <a href={`/api/spotify/playlists/${p.id}/csv`} download aria-label={`Descargar CSV de ${p.name}`} title="Descargar CSV (formato TuneMyMusic)" className={textBtn}>
                      CSV
                    </a>
                  </div>
                ) : (
                  <span />
                )}
              </div>
            ))}
            {error && (
              <p className="flex items-center gap-1.5 pt-3 text-[13px] text-warn">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                {error}
              </p>
            )}
          </div>
        </div>
      </dialog>
    </section>
  );
}
