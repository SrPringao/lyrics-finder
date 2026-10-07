import Link from "next/link";
import { connection } from "next/server";
import { Cover } from "@/components/Cover";
import { IgnoreLyricsButton } from "@/components/IgnoreLyricsButton";
import { pageHref, Pagination } from "@/components/Pagination";
import { PlaylistActions } from "@/components/PlaylistActions";
import { LyricsStatusDot } from "@/components/StatusDot";
import { getDb } from "@/lib/db";
import { listIgnoredTracks, listPlaylists, listTracksWithoutLyrics } from "@/lib/db/repo";
import { getSearchBlockedUntil, quotaMessage } from "@/lib/spotify/api";

const SOURCE_LABEL: Record<string, string> = { spotify: "Spotify", apple: "Apple Music", csv: "CSV" };
const PER_PAGE = 25;
const row = "grid min-h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[14px] border-b border-hairline py-2.5";

export default async function BibliotecaPage({ searchParams }: PageProps<"/biblioteca">) {
  await connection();
  const sp = await searchParams;
  const db = getDb();
  const playlists = listPlaylists(db);
  const missing = listTracksWithoutLyrics(db, sp.p, PER_PAGE);
  const spotifyBlocked = getSearchBlockedUntil(db);
  const hidden = listIgnoredTracks(db);

  return (
    <div className="flex flex-1 flex-col gap-10">
      {spotifyBlocked && (
        <p className="flex items-start gap-1.5 text-[13px] text-secondary">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
          {quotaMessage(spotifyBlocked)} Mientras tanto puedes reproducir las canciones ya vinculadas.
        </p>
      )}

      <section>
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <h1 className="text-[30px] font-bold tracking-[-0.03em]">Playlists</h1>
          <Link href="/importar" className="text-[13px] font-semibold text-accent hover:underline">
            Importar
          </Link>
        </div>
        {playlists.length === 0 ? (
          <p className="pt-5 text-sm text-secondary">Todavía no has importado ninguna playlist.</p>
        ) : (
          playlists.map((p) => (
            <div key={p.id} className={row}>
              <Cover url={p.cover_url} size={44} radius={6} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  <Link href={`/biblioteca/${p.id}`} className="hover:underline">
                    {p.name}
                  </Link>{" "}
                  <span className="font-normal text-secondary">· {SOURCE_LABEL[p.source] ?? p.source}</span>
                </div>
                <div className="truncate text-[13px] text-snippet">
                  {p.total} canciones · {p.synced} sincronizadas · {p.plain} sin tiempos · {p.not_found + p.error} sin letra ·{" "}
                  {p.spotify_matched} en Spotify
                  {p.pending > 0 && ` · ${p.pending} pendientes`}
                </div>
              </div>
              <PlaylistActions playlistId={p.id} retryable={p.not_found + p.error + p.pending} unlinked={p.total - p.spotify_matched} />
            </div>
          ))
        )}
      </section>

      <section className="flex flex-1 flex-col">
        <h2 className="border-b border-hairline pb-3 text-[17px] font-semibold">Canciones sin letra ({missing.total})</h2>
        {missing.total === 0 ? (
          <p className="pt-5 text-sm text-secondary">Todas las canciones tienen letra o son instrumentales.</p>
        ) : (
          missing.items.map((t) => (
            <div key={t.id} className={row}>
              <Cover url={t.cover_url} size={44} radius={6} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  <Link href={`/cancion/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>{" "}
                  <span className="font-normal text-secondary">· {t.artist}</span>
                </div>
                <LyricsStatusDot status={t.lyrics_status} />
              </div>
              <div className="flex items-center gap-4">
                <IgnoreLyricsButton trackId={t.id} ignored={false} />
                <Link href={`/cancion/${t.id}`} className="text-[13px] font-semibold text-accent hover:underline">
                  Pegar letra
                </Link>
              </div>
            </div>
          ))
        )}
        <Pagination page={missing.page} pages={missing.pages} href={(n) => pageHref("/biblioteca", {}, n)} />
      </section>

      {hidden.length > 0 && (
        <details className="group pb-6">
          <summary className="flex cursor-pointer list-none items-center justify-between border-b border-hairline pb-3 text-[15px] font-semibold text-secondary hover:text-ink">
            <span>Ocultas ({hidden.length})</span>
            <span className="text-xs font-normal">
              <span className="group-open:hidden">Mostrar</span>
              <span className="hidden group-open:inline">Esconder</span>
            </span>
          </summary>
          <p className="pt-3 text-[13px] text-secondary">Canciones que marcaste como sin letra: no se vuelven a buscar.</p>
          {hidden.map((t) => (
            <div key={t.id} className={row}>
              <Cover url={t.cover_url} size={44} radius={6} />
              <div className="min-w-0 truncate text-sm font-semibold">
                <Link href={`/cancion/${t.id}`} className="hover:underline">
                  {t.title}
                </Link>{" "}
                <span className="font-normal text-secondary">· {t.artist}</span>
              </div>
              <IgnoreLyricsButton trackId={t.id} ignored />
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
