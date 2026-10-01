import Link from "next/link";
import { connection } from "next/server";
import { Highlighted } from "@/components/Highlighted";
import { SpotifyButton } from "@/components/SpotifyButton";
import { PlayButton } from "@/components/spotify/PlayButton";
import { getDb } from "@/lib/db";
import { listPlaylists } from "@/lib/db/repo";
import { MIN_CONTAINS_LENGTH, searchLyrics, type SearchMode } from "@/lib/search/fts";

export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const playlistId = typeof sp.playlist === "string" && sp.playlist ? Number(sp.playlist) : null;
  const mode: SearchMode = sp.modo === "contiene" ? "contiene" : "palabra";

  const db = getDb();
  const playlists = listPlaylists(db);
  const result = q.trim() ? searchLyrics(db, q, { playlistId, mode }) : null;

  return (
    <div className="space-y-6">
      <form action="/buscar" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder='Busca una palabra o "una frase exacta"…'
          className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 shadow-sm focus:border-emerald-500 focus:outline-none"
        />
        <select
          name="playlist"
          defaultValue={playlistId ?? ""}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm shadow-sm"
        >
          <option value="">Todas las playlists</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700">Buscar</button>
        </div>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Tipo de coincidencia</legend>
          {(
            [
              ["palabra", "Palabra completa", "“madrid” encuentra Madrid, pero “madri” no"],
              ["contiene", "Contiene el texto", "“madri” también encuentra Madrid"],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              title={hint}
              className="cursor-pointer rounded-full border border-stone-300 bg-white px-3 py-1 text-stone-700 has-[:checked]:border-stone-900 has-[:checked]:bg-stone-900 has-[:checked]:text-white"
            >
              <input type="radio" name="modo" value={value} defaultChecked={mode === value} className="sr-only" />
              {label}
            </label>
          ))}
          <span className="text-xs text-stone-500">
            {mode === "contiene" ? "Busca el texto dentro de las palabras." : "Solo palabras completas."}
          </span>
        </fieldset>
      </form>

      {playlists.length === 0 && (
        <p className="text-sm text-stone-600">
          Aún no hay playlists. <Link href="/importar" className="underline">Importa una</Link> para empezar.
        </p>
      )}

      {!result && playlists.length > 0 && (
        <p className="text-sm text-stone-500">
          Consejos: no importan mayúsculas ni acentos · usa comillas para frases exactas · con “Contiene el texto” puedes
          escribir solo una parte de la palabra (mínimo {MIN_CONTAINS_LENGTH} letras).
        </p>
      )}

      {result && (
        <>
          {result.ignored.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Se ignoró {result.ignored.map((t) => `“${t}”`).join(", ")}: en “Contiene el texto” cada término necesita al menos{" "}
              {MIN_CONTAINS_LENGTH} letras.
            </p>
          )}
          <p className="text-sm text-stone-600">
            {result.totalLines === 0
              ? mode === "palabra"
                ? "Sin resultados. Prueba con “Contiene el texto” si escribiste solo parte de una palabra."
                : "Sin resultados."
              : `${result.totalLines} ${result.totalLines === 1 ? "línea" : "líneas"} en ${result.tracks.length} ${
                  result.tracks.length === 1 ? "canción" : "canciones"
                }${result.truncated ? " (mostrando las primeras)" : ""}`}
          </p>

          <ul className="space-y-4">
            {result.tracks.map((t) => (
              <li key={t.trackId} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/cancion/${t.trackId}`} className="font-semibold hover:underline">
                      {t.title}
                    </Link>
                    <p className="text-sm text-stone-600">
                      {t.artist}
                      {t.album && <span className="text-stone-400"> · {t.album}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">
                      {t.hits.length} {t.hits.length === 1 ? "mención" : "menciones"}
                    </span>
                    <SpotifyButton uri={t.spotifyUri} title={t.title} artist={t.artist} />
                  </div>
                </div>

                <ul className="mt-3 space-y-2">
                  {t.hits.map((h) => (
                    <li key={h.lineId} className="flex gap-3 text-sm">
                      <div className="w-16 shrink-0 pt-0.5 text-right">
                        <PlayButton trackId={t.trackId} timeMs={h.timeMs} lineIndex={h.lineIndex} />
                      </div>
                      <div className="min-w-0 leading-relaxed">
                        {h.before && <p className="truncate text-stone-400">{h.before}</p>}
                        <p className="text-stone-900">
                          <Highlighted text={h.highlighted} />
                        </p>
                        {h.after && <p className="truncate text-stone-400">{h.after}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
