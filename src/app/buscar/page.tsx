import Link from "next/link";
import { connection } from "next/server";
import { pageHref, Pagination } from "@/components/Pagination";
import { ResultsList, type ResultTrack } from "@/components/search/ResultsList";
import { SearchBar } from "@/components/search/SearchBar";
import { getDb } from "@/lib/db";
import { listPlaylists, pageParams } from "@/lib/db/repo";
import { MIN_CONTAINS_LENGTH, searchLyrics, type SearchMode } from "@/lib/search/fts";

const PER_PAGE = 8;

export default async function BuscarPage({ searchParams }: PageProps<"/buscar">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const playlistId = typeof sp.playlist === "string" && sp.playlist ? Number(sp.playlist) : null;
  const mode: SearchMode = sp.modo === "contiene" ? "contiene" : "palabra";

  const db = getDb();
  const playlists = listPlaylists(db);
  const result = q.trim() ? searchLyrics(db, q, { playlistId, mode }) : null;

  const total = result?.tracks.length ?? 0;
  const { page, pages, offset } = pageParams(sp.p, PER_PAGE, total);
  const pageTracks: ResultTrack[] = (result?.tracks ?? []).slice(offset, offset + PER_PAGE).map((t) => ({
    ...t,
    hits: t.hits.map((h) => ({ lineId: h.lineId, lineIndex: h.lineIndex, timeMs: h.timeMs, highlighted: h.highlighted })),
    best: [...t.hits].sort((a, b) => a.rank - b.rank)[0]?.highlighted ?? "",
  }));
  const context = {
    q,
    mode,
    results: (result?.tracks ?? []).map((t) => ({
      trackId: t.trackId,
      times: t.hits.map((h) => h.timeMs).filter((x): x is number => x != null),
    })),
  };

  const summary =
    result && result.totalLines > 0
      ? `${total} ${total === 1 ? "canción" : "canciones"} · ${result.totalLines} ${result.totalLines === 1 ? "línea" : "líneas"}${
          result.truncated ? " (las primeras)" : ""
        }`
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        key={`${q}|${mode}|${playlistId ?? ""}`}
        q={q}
        mode={mode}
        playlistId={playlistId}
        playlists={playlists.map((p) => ({ id: p.id, name: p.name }))}
        summary={summary}
      />

      <div className="mt-[18px] flex flex-1 flex-col border-t border-hairline">
        {playlists.length === 0 ? (
          <p className="pt-5 text-sm text-secondary">
            Aún no hay playlists.{" "}
            <Link href="/importar" className="font-semibold text-accent">
              Importa una
            </Link>{" "}
            para empezar.
          </p>
        ) : !result ? (
          <p className="pt-5 text-sm leading-relaxed text-secondary">
            No importan mayúsculas ni acentos. Usa comillas para frases exactas. Con “Contiene el texto” puedes escribir solo
            una parte de la palabra (mínimo {MIN_CONTAINS_LENGTH} letras).
          </p>
        ) : (
          <>
            {result.ignored.length > 0 && (
              <p className="flex items-center gap-1.5 pt-4 text-[13px] text-warn">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
                Se ignoró {result.ignored.map((t) => `“${t}”`).join(", ")}: en “Contiene el texto” cada término necesita al menos{" "}
                {MIN_CONTAINS_LENGTH} letras.
              </p>
            )}
            {result.totalLines === 0 ? (
              <p className="pt-5 text-sm text-secondary">
                Sin resultados.
                {mode === "palabra" && " Prueba con “Contiene el texto” si escribiste solo parte de una palabra."}
              </p>
            ) : (
              <ResultsList tracks={pageTracks} context={context} />
            )}
            <Pagination page={page} pages={pages} href={(n) => pageHref("/buscar", { q, modo: mode, playlist: playlistId }, n)} />
          </>
        )}
      </div>
    </div>
  );
}
