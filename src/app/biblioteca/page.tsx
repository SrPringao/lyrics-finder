import Link from "next/link";
import { connection } from "next/server";
import { PlaylistActions } from "@/components/PlaylistActions";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/db";
import { listPlaylists, listTracksWithoutLyrics } from "@/lib/db/repo";
import { getSearchBlockedUntil, quotaMessage } from "@/lib/spotify/api";

const SOURCE_LABEL: Record<string, string> = { spotify: "Spotify", apple: "Apple Music", csv: "CSV" };

export default async function BibliotecaPage() {
  await connection();
  const db = getDb();
  const playlists = listPlaylists(db);
  const missing = listTracksWithoutLyrics(db);
  const spotifyBlocked = getSearchBlockedUntil(db);

  return (
    <div className="space-y-10">
      {spotifyBlocked && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {quotaMessage(spotifyBlocked)} Mientras tanto puedes reproducir las canciones ya vinculadas, y las demás se abren
          con “Buscar en Spotify”.
        </p>
      )}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Playlists</h1>
          <Link href="/importar" className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            + Importar
          </Link>
        </div>
        {playlists.length === 0 ? (
          <p className="text-sm text-stone-600">Todavía no has importado ninguna playlist.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
            {playlists.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`/biblioteca/${p.id}`} className="font-medium hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {SOURCE_LABEL[p.source] ?? p.source} · {p.total} canciones · {p.synced} sincronizadas · {p.plain} sin
                    tiempos · {p.instrumental} instrumentales · {p.not_found + p.error} sin letra
                    {p.pending > 0 && ` · ${p.pending} pendientes`}
                  </p>
                  <p className="text-xs text-stone-500">
                    Spotify: {p.spotify_matched}/{p.total} vinculadas
                    {p.spotify_not_found > 0 && ` · ${p.spotify_not_found} no están en Spotify`}
                  </p>
                </div>
                <PlaylistActions
                  playlistId={p.id}
                  retryable={p.not_found + p.error + p.pending}
                  unlinked={p.total - p.spotify_matched}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Canciones sin letra ({missing.length})</h2>
        {missing.length === 0 ? (
          <p className="text-sm text-stone-600">Todas las canciones tienen letra o son instrumentales.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm">
            {missing.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <Link href={`/cancion/${t.id}`} className="min-w-0 truncate hover:underline">
                  <span className="font-medium">{t.title}</span> <span className="text-stone-500">— {t.artist}</span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={t.lyrics_status} />
                  <Link href={`/cancion/${t.id}`} className="text-xs text-emerald-700 hover:underline">
                    Pegar letra
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
