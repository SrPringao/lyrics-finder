import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/Cover";
import { LyricsEditor } from "@/components/LyricsEditor";
import { LyricsFull } from "@/components/song/LyricsFull";
import { PlayButton } from "@/components/spotify/PlayButton";
import { SpotifyButton } from "@/components/SpotifyButton";
import { LyricsStatusDot, SpotifyStatusDot } from "@/components/StatusDot";
import { getDb } from "@/lib/db";
import { getTrack, getTrackLines, getTrackPlaylists } from "@/lib/db/repo";
import { formatTime } from "@/lib/parsers/lrc";

export default async function CancionPage({ params }: PageProps<"/cancion/[id]">) {
  await connection();
  const id = Number((await params).id);
  const db = getDb();
  const track = getTrack(db, id);
  if (!track) notFound();
  const lines = getTrackLines(db, id).map((l) => ({ i: l.line_index, t: l.time_ms, text: l.text }));
  const playlists = getTrackPlaylists(db, id);

  return (
    <div className="flex flex-col gap-7 pb-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
        <Cover url={track.cover_url} size={160} radius={12} shadow={track.cover_url ? "0 14px 30px rgba(40,60,35,0.28)" : undefined} />
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-[-0.03em]">{track.title}</h1>
          <p className="text-[15px] text-secondary">
            {track.artist}
            {track.album && <> · {track.album}</>}
            {track.duration_sec != null && <> · {formatTime(track.duration_sec * 1000)}</>}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <LyricsStatusDot status={track.lyrics_status} manual={track.lyrics_source === "manual"} />
            <SpotifyStatusDot status={track.spotify_status} uri={track.spotify_uri} />
            {playlists.map((p) => (
              <Link key={p.id} href={`/biblioteca/${p.id}`} className="rounded-full bg-pill px-[13px] py-1 text-xs text-ink hover:bg-hairline">
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PlayButton trackId={track.id} />
        <SpotifyButton uri={track.spotify_uri} title={track.title} artist={track.primary_artist} />
      </div>

      {track.lyrics_error && (
        <p className="flex items-center gap-1.5 text-[13px] text-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
          Último error: {track.lyrics_error}
        </p>
      )}

      <LyricsEditor
        trackId={track.id}
        initialText={track.synced_lyrics_raw ?? track.plain_lyrics ?? ""}
        startOpen={lines.length === 0 && track.lyrics_status !== "instrumental"}
      />

      <div className="border-t border-hairline pt-6">
        {track.lyrics_status === "instrumental" && lines.length === 0 ? (
          <p className="text-[22px] font-bold tracking-[-0.02em] lg:text-[30px]">Esta canción es instrumental.</p>
        ) : lines.length > 0 ? (
          <LyricsFull trackId={track.id} lines={lines} />
        ) : (
          <p className="text-sm text-secondary">Todavía no hay letra para esta canción.</p>
        )}
      </div>
    </div>
  );
}
