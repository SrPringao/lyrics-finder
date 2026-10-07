"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Cover } from "@/components/Cover";
import { ChevronDownIcon, ChevronLeftIcon, CloseIcon, SearchIcon } from "@/components/Icons";
import { formatClock } from "@/lib/player/timing";

type Kind = "track" | "album";

interface Row {
  id: string;
  name: string;
  artists: string;
  coverUrl: string | null;
  detail: string;
}

interface TrackItem {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  durationMs: number;
}

interface AlbumItem {
  id: string;
  name: string;
  artists: string;
  coverUrl: string | null;
  year: string | null;
  totalTracks: number;
}

interface AlbumDetail {
  id: string;
  name: string;
  artists: string;
  year: string | null;
  coverUrl: string | null;
  tracks: { id: string; name: string; artists: string; durationMs: number; trackNumber: number | null; discNumber: number; playable: boolean }[];
}

const textBtn = "border-0 bg-transparent p-0 text-[13px] font-semibold text-accent hover:underline disabled:opacity-40 disabled:no-underline";
const pill = "rounded-full border-0 px-[13px] py-1.5";

/** Modal para buscar canciones o álbumes en Spotify y agregarlos a una playlist de la app. */
export function SpotifyCatalog({ playlists }: { playlists: { id: number; name: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("track");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ playlistId: number; text: string } | null>(null);
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [albumLoading, setAlbumLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addedTracks, setAddedTracks] = useState<Set<string>>(new Set());

  async function search(k: Kind = kind) {
    const q = query.trim();
    if (!q) return;
    setAlbum(null);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/spotify/search?${new URLSearchParams({ q, type: k })}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo buscar");
      setRows(
        k === "track"
          ? (data.items as TrackItem[]).map((t) => ({
              id: t.id,
              name: t.name,
              artists: t.artists,
              coverUrl: t.coverUrl,
              detail: `${t.album} · ${formatClock(t.durationMs)}`,
            }))
          : (data.items as AlbumItem[]).map((a) => ({
              id: a.id,
              name: a.name,
              artists: a.artists,
              coverUrl: a.coverUrl,
              detail: `${a.year ? `${a.year} · ` : ""}${a.totalTracks} ${a.totalTracks === 1 ? "canción" : "canciones"}`,
            })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  type AddResponse = { added: number; already: number; playlistName: string; playlistId: number };

  function report({ added, already, playlistName, playlistId }: AddResponse) {
    setResult({
      playlistId,
      text:
        (added > 0 ? `Se ${added === 1 ? "agregó 1 canción" : `agregaron ${added} canciones`} a “${playlistName}”` : `Ya estaba en “${playlistName}”`) +
        (added > 0 && already > 0 ? ` (${already} ya estaban)` : "") +
        (added > 0 ? ". Las letras se descargan en segundo plano." : "."),
    });
  }

  async function postAdd(payload: Record<string, unknown>): Promise<AddResponse> {
    const res = await fetch("/api/spotify/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, playlistId: target ? Number(target) : null }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "No se pudo agregar");
    return data as AddResponse;
  }

  async function openAlbum(id: string) {
    setAlbumLoading(id);
    setError(null);
    try {
      const res = await fetch(`/api/spotify/albums/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir el álbum");
      const detail = data as AlbumDetail;
      setAlbum(detail);
      // Por defecto, todas las que se pueden reproducir.
      setSelected(new Set(detail.tracks.filter((t) => t.playable).map((t) => t.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAlbumLoading(null);
    }
  }

  async function addSelected() {
    if (!album || selected.size === 0) return;
    setBusyId(album.id);
    setError(null);
    try {
      const ids = [...selected];
      const data = await postAdd({ kind: "album", id: album.id, trackIds: ids });
      setAddedTracks((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      report(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function add(row: Row) {
    setBusyId(row.id);
    setError(null);
    try {
      const data = await postAdd({ kind, id: row.id });
      setDone((d) => ({ ...d, [`${kind}:${row.id}`]: data.added > 0 ? (kind === "album" ? `Agregadas ${data.added}` : "Agregada") : "Ya estaba" }));
      report(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="rounded-full bg-pill px-[13px] py-1.5 text-[13px] text-ink hover:bg-hairline">
        Buscar canción o álbum
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="catalog-title"
        className="m-auto w-[calc(100%-32px)] max-w-[600px] rounded-[14px] bg-white p-0 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop:bg-black/30"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-2">
            <h2 id="catalog-title" className="text-[17px] font-semibold">
              Agregar desde Spotify
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

          <div className="flex flex-col gap-3 px-6 pb-3">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
              className="flex items-center gap-2.5 border-b border-input-underline pb-2 text-secondary"
            >
              <SearchIcon size={14} />
              <label htmlFor="catalog-q" className="sr-only">
                Buscar en Spotify
              </label>
              <input
                id="catalog-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kind === "album" ? "Álbum o artista" : "Canción o artista"}
                autoComplete="off"
                className="min-w-0 flex-grow border-0 bg-transparent p-0 text-[17px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-disabled"
              />
              <button type="submit" disabled={!query.trim() || loading} className={textBtn}>
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {(
                [
                  ["track", "Canciones"],
                  ["album", "Álbumes"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setRows(null);
                    if (query.trim()) void search(value);
                  }}
                  className={`${pill} ${kind === value ? "bg-ink text-white" : "bg-pill text-ink"}`}
                >
                  {label}
                </button>
              ))}
              <label className="relative ml-auto">
                <span className="sr-only">Agregar a</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={`${pill} max-w-60 cursor-pointer appearance-none truncate bg-pill pr-[30px] text-ink`}
                >
                  <option value="">Agregar a: Agregadas desde Spotify</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      Agregar a: {p.name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-[13px] -translate-y-1/2 text-ink" />
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-6 pb-4">
            {error && (
              <p className="flex items-center gap-1.5 pt-3 text-[13px] text-warn">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                {error}
              </p>
            )}
            {album ? (
              <AlbumView
                album={album}
                selected={selected}
                setSelected={setSelected}
                addedTracks={addedTracks}
                busy={busyId === album.id}
                onBack={() => setAlbum(null)}
                onAdd={addSelected}
              />
            ) : (
              <>
                {rows === null && !error && (
                  <p className="pt-4 text-sm text-secondary">
                    Busca una canción o un álbum de cualquier artista. En los álbumes puedes entrar y elegir canciones. Llegan ya
                    vinculadas a Spotify y sus letras se descargan solas.
                  </p>
                )}
                {rows?.length === 0 && <p className="pt-4 text-sm text-secondary">Sin resultados.</p>}
                {rows?.map((r) => {
                  const state = done[`${kind}:${r.id}`];
                  const info = (
                    <>
                      <Cover url={r.coverUrl} size={44} radius={6} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {r.name} <span className="font-normal text-secondary">· {r.artists}</span>
                        </span>
                        <span className="block truncate text-[13px] text-snippet">
                          {kind === "album" && albumLoading === r.id ? "Abriendo…" : r.detail}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <div key={r.id} className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-[14px] border-b border-hairline last:border-b-0">
                      {kind === "album" ? (
                        <button
                          type="button"
                          onClick={() => openAlbum(r.id)}
                          disabled={albumLoading !== null}
                          title="Ver canciones del álbum"
                          className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-[14px] text-left hover:opacity-80"
                        >
                          {info}
                        </button>
                      ) : (
                        <div className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-[14px]">{info}</div>
                      )}
                      {state ? (
                        <span className="text-[13px] text-secondary">{state}</span>
                      ) : kind === "album" ? (
                        <div className="flex items-center gap-4">
                          <button type="button" disabled={albumLoading !== null} onClick={() => openAlbum(r.id)} className={textBtn}>
                            Elegir canciones
                          </button>
                          <button type="button" disabled={busyId !== null} onClick={() => add(r)} className={`${textBtn} hidden sm:inline`}>
                            {busyId === r.id ? "Agregando…" : "Agregar todo"}
                          </button>
                        </div>
                      ) : (
                        <button type="button" disabled={busyId !== null} onClick={() => add(r)} className={textBtn}>
                          {busyId === r.id ? "Agregando…" : "Agregar"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {result && (
            <p className="border-t border-hairline px-6 py-3 text-[13px] text-secondary">
              {result.text}{" "}
              <Link href={`/biblioteca/${result.playlistId}`} className="font-semibold text-accent hover:underline">
                Ver lista
              </Link>
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Un álbum por dentro: casillas para elegir qué canciones agregar. */
function AlbumView({
  album,
  selected,
  setSelected,
  addedTracks,
  busy,
  onBack,
  onAdd,
}: {
  album: AlbumDetail;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  addedTracks: Set<string>;
  busy: boolean;
  onBack: () => void;
  onAdd: () => void;
}) {
  const choosable = album.tracks.filter((t) => t.playable && !addedTracks.has(t.id));
  const allOn = choosable.length > 0 && choosable.every((t) => selected.has(t.id));
  const multiDisc = album.tracks.some((t) => t.discNumber > 1);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 border-b border-hairline py-4">
        <Cover url={album.coverUrl} size={64} radius={8} />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onBack} className="mb-0.5 flex items-center gap-1 text-xs text-secondary hover:text-ink">
            <ChevronLeftIcon size={12} />
            Resultados
          </button>
          <div className="truncate text-[15px] font-semibold">{album.name}</div>
          <div className="truncate text-[13px] text-secondary">
            {album.artists}
            {album.year && ` · ${album.year}`} · {album.tracks.length} {album.tracks.length === 1 ? "canción" : "canciones"}
          </div>
        </div>
      </div>

      <label className="flex h-11 cursor-pointer items-center gap-3 border-b border-hairline text-[13px] text-secondary">
        <input
          type="checkbox"
          checked={allOn}
          disabled={choosable.length === 0}
          onChange={() => setSelected(allOn ? new Set() : new Set(choosable.map((t) => t.id)))}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
        {allOn ? "Quitar todas" : "Seleccionar todas"}
      </label>

      <ul>
        {album.tracks.map((t) => {
          const added = addedTracks.has(t.id);
          const disabled = !t.playable || added;
          return (
            <li key={t.id}>
              <label
                className={`grid h-12 grid-cols-[16px_28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline text-sm ${
                  disabled ? "cursor-default opacity-50" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  disabled={disabled}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                <span className="text-right font-mono text-xs text-secondary">
                  {multiDisc && t.trackNumber != null ? `${t.discNumber}-${t.trackNumber}` : (t.trackNumber ?? "")}
                </span>
                <span className="min-w-0 truncate">
                  {t.name}
                  {t.artists !== album.artists && <span className="text-secondary"> · {t.artists}</span>}
                </span>
                <span className="font-mono text-xs text-secondary">
                  {added ? "Agregada" : !t.playable ? "No disponible" : formatClock(t.durationMs)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-white pt-3">
        <span className="text-[13px] text-secondary">
          {selected.size} de {choosable.length} seleccionadas
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={busy || selected.size === 0}
          className="rounded-full bg-ink px-[13px] py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Agregando…" : `Agregar ${selected.size} ${selected.size === 1 ? "canción" : "canciones"}`}
        </button>
      </div>
    </div>
  );
}
