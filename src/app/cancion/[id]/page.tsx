import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LyricsEditor } from "@/components/LyricsEditor";
import { SpotifyButton } from "@/components/SpotifyButton";
import { SpotifyLinkPill } from "@/components/SpotifyLinkPill";
import { PlayButton } from "@/components/spotify/PlayButton";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/db";
import { getTrack, getTrackLines, getTrackPlaylists } from "@/lib/db/repo";
import { formatTime } from "@/lib/parsers/lrc";

export default async function CancionPage({ params }: PageProps<"/cancion/[id]">) {
  await connection();
  const id = Number((await params).id);
  const db = getDb();
  const track = getTrack(db, id);
  if (!track) notFound();
  const lines = getTrackLines(db, id);
  const playlists = getTrackPlaylists(db, id);
  const synced = lines.some((l) => l.time_ms != null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{track.title}</h1>
          <p className="text-stone-600">
            {track.artist}
            {track.album && <span className="text-stone-400"> · {track.album}</span>}
            {track.duration_sec != null && <span className="text-stone-400"> · {formatTime(track.duration_sec * 1000)}</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <StatusBadge status={track.lyrics_status} manual={track.lyrics_source === "manual"} />
            <SpotifyLinkPill status={track.spotify_status} uri={track.spotify_uri} />
            {playlists.map((p) => (
              <Link key={p.id} href={`/biblioteca/${p.id}`} className="rounded-full border border-stone-200 px-2 py-0.5 hover:bg-stone-50">
                {p.name}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PlayButton trackId={track.id} timeMs={null} label="Reproducir" />
          <SpotifyButton uri={track.spotify_uri} title={track.title} artist={track.primary_artist} />
        </div>
      </div>

      {track.lyrics_error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Último error: {track.lyrics_error}</p>}

      <LyricsEditor
        trackId={track.id}
        initialText={track.synced_lyrics_raw ?? track.plain_lyrics ?? ""}
        startOpen={lines.length === 0 && track.lyrics_status !== "instrumental"}
      />

      {track.lyrics_status === "instrumental" && lines.length === 0 && (
        <p className="text-sm text-stone-500">Esta canción es instrumental.</p>
      )}

      {lines.length > 0 && (
        <ol className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          {lines.map((l) => (
            <li key={l.id} id={`l${l.line_index}`} className="flex gap-4 px-2 py-1 leading-relaxed">
              {synced && (
                <span className="w-16 shrink-0 pt-0.5 text-right">
                  <PlayButton trackId={track.id} timeMs={l.time_ms} lineIndex={l.line_index} className="text-stone-500" />
                </span>
              )}
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
