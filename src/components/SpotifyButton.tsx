export function spotifyUrl(uri: string | null): string | null {
  const id = uri?.match(/^spotify:track:([A-Za-z0-9]+)$/)?.[1];
  return id ? `https://open.spotify.com/track/${id}` : null;
}

/** Búsqueda en Spotify por nombre: no usa la API, así que no gasta cupo. */
export function spotifySearchUrl(title: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`.trim())}`;
}

/** Abre la canción en Spotify; si todavía no está vinculada, abre la búsqueda por nombre. */
export function SpotifyButton({ uri, title, artist }: { uri: string | null; title: string; artist: string }) {
  const direct = spotifyUrl(uri);
  return (
    <a
      href={direct ?? spotifySearchUrl(title, artist)}
      target="_blank"
      rel="noreferrer"
      title={direct ? "Abrir la canción en Spotify" : "Todavía no está vinculada: abre la búsqueda en Spotify"}
      className="rounded-full bg-pill px-[13px] py-1.5 text-[13px] text-ink hover:bg-hairline"
    >
      {direct ? "Abrir en Spotify" : "Buscar en Spotify"}
    </a>
  );
}
