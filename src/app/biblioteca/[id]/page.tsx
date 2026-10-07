import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/Cover";
import { pageHref, Pagination } from "@/components/Pagination";
import { PlaylistActions } from "@/components/PlaylistActions";
import { PlayButton } from "@/components/spotify/PlayButton";
import { LyricsStatusDot, SpotifyStatusDot } from "@/components/StatusDot";
import { isGuest } from "@/lib/auth/viewer";
import { getDb } from "@/lib/db";
import { getPlaylistSummary, getPlaylistTracks } from "@/lib/db/repo";
import { formatTime } from "@/lib/parsers/lrc";

const PER_PAGE = 25;

export default async function PlaylistPage({ params, searchParams }: PageProps<"/biblioteca/[id]">) {
  await connection();
  const id = Number((await params).id);
  const sp = await searchParams;
  const db = getDb();
  const summary = getPlaylistSummary(db, id);
  if (!summary) notFound();
  const tracks = getPlaylistTracks(db, id, sp.p, PER_PAGE);
  const guest = await isGuest();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/biblioteca" className="text-[13px] text-secondary hover:text-ink">
            Volver a la biblioteca
          </Link>
          <h1 className="truncate text-[30px] font-bold tracking-[-0.03em]">{summary.name}</h1>
          <p className="text-[13px] text-secondary">
            {summary.total} canciones · {summary.synced} sincronizadas · {summary.plain} sin tiempos · {summary.instrumental}{" "}
            instrumentales · {summary.not_found + summary.error} sin letra
            {summary.ignored > 0 && ` · ${summary.ignored} ocultas`} · {summary.spotify_matched} en Spotify
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link href={`/buscar?playlist=${id}`} className="rounded-full bg-ink px-[13px] py-1.5 text-[13px] text-white">
            Buscar en esta playlist
          </Link>
          {!guest && (
            <PlaylistActions
              playlistId={id}
              retryable={summary.not_found + summary.error + summary.pending}
              unlinked={summary.total - summary.spotify_matched}
              redirectOnDelete="/biblioteca"
            />
          )}
        </div>
      </div>

      {tracks.items.map((t) => (
        <div key={t.position} className="grid h-16 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-[14px] border-b border-hairline">
          <Cover url={t.cover_url} size={44} radius={6} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              <Link href={`/cancion/${t.id}`} className="hover:underline">
                {t.title}
              </Link>{" "}
              <span className="font-normal text-secondary">· {t.artist}</span>
            </div>
            <div className="flex items-center gap-3 truncate text-[13px] text-snippet">
              <LyricsStatusDot status={t.lyrics_status} manual={t.lyrics_source === "manual"} hidden={t.lyrics_ignored === 1} />
              <span className="hidden sm:inline">
                <SpotifyStatusDot status={t.spotify_status} uri={t.spotify_uri} />
              </span>
              {t.duration_sec != null && <span className="hidden font-mono text-xs text-secondary sm:inline">{formatTime(t.duration_sec * 1000)}</span>}
            </div>
          </div>
          {t.spotify_status !== "not_found" ? <PlayButton trackId={t.id} variant="icon" /> : <span />}
        </div>
      ))}

      <Pagination page={tracks.page} pages={tracks.pages} href={(n) => pageHref(`/biblioteca/${id}`, {}, n)} />
    </div>
  );
}
