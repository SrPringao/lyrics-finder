import type { DB } from "@/lib/db";
import type { ParsedPlaylist, ParsedTrack } from "@/lib/parsers/playlist";
import {
  getSearchBlockedUntil,
  pickCover,
  quotaMessage,
  SpotifyApiError,
  spotifyFetch,
  type ApiOptions,
  type SpotifyImage,
  type SpotifyTrack,
} from "@/lib/spotify/api";
import { getAuth } from "@/lib/spotify/auth";

/** Permisos que hacen falta para leer playlists y "Tus me gusta". */
export const LIBRARY_SCOPES = ["playlist-read-private", "playlist-read-collaborative", "user-library-read"];

/** "Tus me gusta" no es una playlist en la API: se identifica con este id. */
export const LIKED_ID = "liked";

export function hasLibraryScopes(db: DB): boolean {
  const granted = new Set((getAuth(db)?.scope ?? "").split(/\s+/));
  return LIBRARY_SCOPES.every((s) => granted.has(s));
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  owner: string;
  total: number;
  coverUrl: string | null;
  /** Spotify solo deja leer las canciones de playlists propias o colaborativas. */
  readable: boolean;
}

interface RawPlaylist {
  id: string;
  name: string;
  collaborative: boolean;
  owner: { id: string; display_name: string | null };
  images: SpotifyImage[] | null;
  items?: { total: number } | null;
  tracks?: { total: number } | null; // campo anterior de la API
}

interface Paged<T> {
  items: T[];
  next: string | null;
  total: number;
}

async function getPaged<T>(db: DB, path: string, opts: ApiOptions, max = 10_000): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = path;
  while (next && out.length < max) {
    const res = await spotifyFetch(db, next, {}, opts);
    const page = (await res.json()) as Paged<T>;
    out.push(...page.items);
    // `next` viene como URL absoluta: se queda solo la ruta.
    next = page.next ? page.next.replace(/^https:\/\/api\.spotify\.com\/v1/, "") : null;
  }
  return out;
}

export async function listMyPlaylists(db: DB, opts: ApiOptions = {}): Promise<SpotifyPlaylistSummary[]> {
  const me = getAuth(db)?.user_id ?? null;
  const raw = await getPaged<RawPlaylist | null>(db, "/me/playlists?limit=50", opts);
  return raw
    .filter((p): p is RawPlaylist => !!p)
    .map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner.display_name ?? p.owner.id,
      total: p.items?.total ?? p.tracks?.total ?? 0,
      coverUrl: pickCover(p.images),
      readable: p.collaborative || (me != null && p.owner.id === me),
    }));
}

export async function countLikedTracks(db: DB, opts: ApiOptions = {}): Promise<number> {
  const res = await spotifyFetch(db, "/me/tracks?limit=1", {}, opts);
  return ((await res.json()) as { total: number }).total;
}

export async function getPlaylistName(db: DB, id: string, opts: ApiOptions = {}): Promise<string> {
  if (id === LIKED_ID) return "Tus me gusta";
  const res = await spotifyFetch(db, `/playlists/${encodeURIComponent(id)}?fields=name`, {}, opts);
  return ((await res.json()) as { name: string }).name;
}

/** Elemento de playlist o de "Tus me gusta": la canción viene en `item` (o en `track`, el campo anterior). */
export interface RawEntry {
  is_local?: boolean;
  item?: (SpotifyTrack & { type?: string }) | null;
  track?: (SpotifyTrack & { type?: string }) | null;
}

export async function getTracksOf(db: DB, id: string, opts: ApiOptions = {}): Promise<RawEntry[]> {
  const path =
    id === LIKED_ID
      ? "/me/tracks?limit=50&market=from_token"
      : `/playlists/${encodeURIComponent(id)}/items?limit=50&market=from_token&additional_types=track`;
  return getPaged<RawEntry>(db, path, opts);
}

/**
 * Convierte las canciones de Spotify al mismo formato que un archivo importado. Se omiten
 * episodios de podcast, archivos locales y canciones sin nombre.
 */
export function entriesToParsed(entries: RawEntry[], playlistName: string): ParsedPlaylist {
  const tracks: ParsedTrack[] = [];
  let skipped = 0;
  for (const e of entries) {
    const t = e.item ?? e.track;
    if (!t || e.is_local || (t.type && t.type !== "track") || !t.name || !t.uri?.startsWith("spotify:track:")) {
      skipped++;
      continue;
    }
    const artists = t.artists.map((a) => a.name).filter(Boolean);
    const track: ParsedTrack = {
      title: t.name,
      artist: artists.join(", "),
      primaryArtist: artists[0] ?? "",
      album: t.album?.name || null,
      durationSec: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
      source: "spotify",
      spotifyUri: t.uri,
      artists,
    };
    const isrc = t.external_ids?.isrc?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (isrc) track.isrc = isrc;
    const cover = pickCover(t.album?.images);
    if (cover) track.coverUrl = cover;
    tracks.push(track);
  }
  return { source: "spotify", encoding: "utf-8", delimiter: ",", tracks, skipped, playlistName };
}

// ---------------------------------------------------------------------------
// CSV con el formato de TuneMyMusic
// ---------------------------------------------------------------------------

export const TMM_HEADERS = ["Track name", "Artist name", "Album", "Playlist name", "Type", "ISRC", "Apple - id"];

/** "A, B & C": así une TuneMyMusic varios artistas. */
export function joinArtistsTmm(artists: string[]): string {
  if (artists.length <= 1) return artists[0] ?? "";
  return `${artists.slice(0, -1).join(", ")} & ${artists[artists.length - 1]}`;
}

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** UTF-8 con BOM, todos los campos entre comillas y saltos de línea \n, igual que TuneMyMusic. */
export function toTuneMyMusicCsv(parsed: ParsedPlaylist, playlistName: string): string {
  const rows = parsed.tracks.map((t) =>
    [t.title, joinArtistsTmm(t.artists ?? (t.artist ? t.artist.split(", ") : [])), t.album ?? "", playlistName, "Playlist", t.isrc ?? "", t.appleId ?? ""]
      .map(q)
      .join(","),
  );
  return "﻿" + [TMM_HEADERS.join(","), ...rows].join("\n");
}

/** Nombre de archivo seguro a partir del nombre de la playlist. */
export function csvFileName(name: string): string {
  const base = name.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").trim() || "playlist";
  return `${base}.csv`;
}

// ---------------------------------------------------------------------------
// Buscar en el catálogo de Spotify y agregar canciones o álbumes
// ---------------------------------------------------------------------------

export interface CatalogTrack {
  id: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string | null;
  durationMs: number;
}

export interface CatalogAlbum {
  id: string;
  name: string;
  artists: string;
  coverUrl: string | null;
  year: string | null;
  totalTracks: number;
}

interface RawAlbum {
  id: string;
  name: string;
  artists: { name: string }[];
  images: SpotifyImage[] | null;
  release_date?: string;
  total_tracks: number;
}

/** Usa el cupo de búsquedas de la app (como la vinculación): respeta el bloqueo si se agotó. */
export async function searchCatalog(
  db: DB,
  query: string,
  type: "track" | "album",
  opts: ApiOptions = {},
): Promise<CatalogTrack[] | CatalogAlbum[]> {
  const blocked = getSearchBlockedUntil(db);
  if (blocked) throw new SpotifyApiError(429, "QUOTA_EXCEEDED", quotaMessage(blocked));
  const params = new URLSearchParams({ q: query, type, limit: "10", market: "from_token" });
  const res = await spotifyFetch(db, `/search?${params}`, {}, opts);
  const data = (await res.json()) as { tracks?: { items: (SpotifyTrack | null)[] }; albums?: { items: (RawAlbum | null)[] } };
  if (type === "track") {
    return (data.tracks?.items ?? [])
      .filter((t): t is SpotifyTrack => !!t)
      .map((t) => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => a.name).join(", "),
        album: t.album?.name ?? "",
        coverUrl: pickCover(t.album?.images),
        durationMs: t.duration_ms,
      }));
  }
  return (data.albums?.items ?? [])
    .filter((a): a is RawAlbum => !!a)
    .map((a) => ({
      id: a.id,
      name: a.name,
      artists: a.artists.map((x) => x.name).join(", "),
      coverUrl: pickCover(a.images),
      year: a.release_date?.slice(0, 4) ?? null,
      totalTracks: a.total_tracks,
    }));
}

/** Una canción completa (incluye ISRC y portada). */
export async function getTrackEntries(db: DB, id: string, opts: ApiOptions = {}): Promise<RawEntry[]> {
  const res = await spotifyFetch(db, `/tracks/${encodeURIComponent(id)}?market=from_token`, {}, opts);
  return [{ item: (await res.json()) as SpotifyTrack }];
}

/**
 * Todas las canciones de un álbum. Las canciones de un álbum no traen el álbum ni el ISRC:
 * se les pone el nombre y la portada del álbum (el ISRC no hace falta, ya llevan su URI).
 */
export interface AlbumWithEntries {
  id: string;
  name: string;
  artists: string;
  year: string | null;
  coverUrl: string | null;
  entries: RawEntry[];
}

export async function getAlbumEntries(db: DB, id: string, opts: ApiOptions = {}): Promise<AlbumWithEntries> {
  const res = await spotifyFetch(db, `/albums/${encodeURIComponent(id)}?market=from_token`, {}, opts);
  const album = (await res.json()) as RawAlbum & { tracks: Paged<SpotifyTrack> };
  const items = [...album.tracks.items];
  if (album.tracks.next) {
    const rest = await getPaged<SpotifyTrack>(db, album.tracks.next.replace(/^https:\/\/api\.spotify\.com\/v1/, ""), opts);
    items.push(...rest);
  }
  const albumInfo = { name: album.name, images: album.images ?? [] };
  return {
    id: album.id,
    name: album.name,
    artists: album.artists.map((x) => x.name).join(", "),
    year: album.release_date?.slice(0, 4) ?? null,
    coverUrl: pickCover(album.images),
    entries: items.map((t) => ({ item: { ...t, album: albumInfo } })),
  };
}
