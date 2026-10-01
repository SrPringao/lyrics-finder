import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PlaylistActions } from "@/components/PlaylistActions";
import { PlayButton } from "@/components/spotify/PlayButton";
import { SpotifyLinkPill } from "@/components/SpotifyLinkPill";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/db";
import { getPlaylistSummary, getPlaylistTracks } from "@/lib/db/repo";
import { formatTime } from "@/lib/parsers/lrc";

export default async function PlaylistPage({ params }: PageProps<"/biblioteca/[id]">) {
  await connection();
  const id = Number((await params).id);
  const db = getDb();
  const summary = getPlaylistSummary(db, id);
  if (!summary) notFound();
  const tracks = getPlaylistTracks(db, id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/biblioteca" className="text-sm text-stone-500 hover:underline">
            Volver a la biblioteca
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{summary.name}</h1>
          <p className="text-sm text-stone-600">
            {summary.total} canciones · {summary.synced} sincronizadas · {summary.plain} sin tiempos · {summary.instrumental}{" "}
            instrumentales · {summary.not_found + summary.error} sin letra · {summary.spotify_matched} vinculadas a Spotify
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/buscar?playlist=${id}`} className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            Buscar en esta playlist
          </Link>
          <PlaylistActions
            playlistId={id}
            retryable={summary.not_found + summary.error + summary.pending}
            unlinked={summary.total - summary.spotify_matched}
            redirectOnDelete="/biblioteca"
          />
        </div>
      </div>

      <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
        {tracks.map((t) => (
          <li key={t.position} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="w-6 shrink-0 text-right text-xs text-stone-400">{t.position + 1}</span>
            <Link href={`/cancion/${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
              <span className="font-medium">{t.title}</span> <span className="text-stone-500">— {t.artist}</span>
            </Link>
            <span className="hidden font-mono text-xs text-stone-400 sm:inline">
              {t.duration_sec != null ? formatTime(t.duration_sec * 1000) : ""}
            </span>
            <StatusBadge status={t.lyrics_status} manual={t.lyrics_source === "manual"} />
            <SpotifyLinkPill status={t.spotify_status} uri={t.spotify_uri} />
            {t.spotify_status !== "not_found" && <PlayButton trackId={t.id} timeMs={null} label="" />}
          </li>
        ))}
      </ol>
    </div>
  );
}
