import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "@/lib/db";
import { addTracksToPlaylist, ADDED_PLAYLIST_NAME, getOrCreatePlaylist, getTrack, importPlaylist } from "@/lib/db/repo";
import { parsePlaylistFile } from "@/lib/parsers/playlist";
import type { SpotifyTrack } from "@/lib/spotify/api";
import { saveTokens } from "@/lib/spotify/auth";
import {
  csvFileName,
  entriesToParsed,
  getAlbumEntries,
  getTracksOf,
  hasLibraryScopes,
  joinArtistsTmm,
  listMyPlaylists,
  searchCatalog,
  toTuneMyMusicCsv,
} from "@/lib/spotify/library";

// Canciones inventadas para las pruebas.
const sp = (over: Partial<SpotifyTrack>): SpotifyTrack => ({
  id: "a1",
  uri: "spotify:track:a1",
  name: "Canción de Prueba",
  duration_ms: 185_400,
  artists: [{ name: "Grupo Uno" }],
  album: { name: "Álbum \"Especial\"", images: [{ url: "https://i.scdn.co/image/640", width: 640, height: 640 }, { url: "https://i.scdn.co/image/300", width: 300, height: 300 }] },
  external_ids: { isrc: "usaaa1500001" },
  ...over,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});

function connect(scope: string) {
  saveTokens(db, { access_token: "tok", refresh_token: "ref", expires_in: 3600, scope }, { id: "yo", display_name: "Yo", product: "premium" });
}

describe("conversión de canciones de Spotify", () => {
  it("lee el campo nuevo `item` y el anterior `track`, y omite locales y episodios", () => {
    const parsed = entriesToParsed(
      [
        { item: sp({ artists: [{ name: "Tyler, The Creator" }, { name: "Otro" }] }) },
        { track: sp({ id: "b2", uri: "spotify:track:b2", name: "Segunda", external_ids: {} }) },
        { is_local: true, item: sp({ uri: "spotify:local:x" }) },
        { item: { ...sp({ uri: "spotify:episode:e1" }), type: "episode" } },
        { item: null },
      ],
      "Mi lista",
    );
    expect(parsed).toMatchObject({ source: "spotify", skipped: 3, playlistName: "Mi lista" });
    expect(parsed.tracks[0]).toEqual({
      title: "Canción de Prueba",
      artist: "Tyler, The Creator, Otro",
      artists: ["Tyler, The Creator", "Otro"],
      primaryArtist: "Tyler, The Creator",
      album: 'Álbum "Especial"',
      durationSec: 185,
      source: "spotify",
      spotifyUri: "spotify:track:a1",
      isrc: "USAAA1500001",
      coverUrl: "https://i.scdn.co/image/300",
    });
    expect(parsed.tracks[1].isrc).toBeUndefined();
  });
});

describe("CSV con formato de TuneMyMusic", () => {
  it("une artistas como 'A, B & C'", () => {
    expect(joinArtistsTmm([])).toBe("");
    expect(joinArtistsTmm(["A"])).toBe("A");
    expect(joinArtistsTmm(["A", "B"])).toBe("A & B");
    expect(joinArtistsTmm(["A", "B", "C"])).toBe("A, B & C");
  });

  it("BOM, encabezados, todos los campos entre comillas y saltos \\n", () => {
    const parsed = entriesToParsed([{ item: sp({ artists: [{ name: "Uno" }, { name: "Dos" }, { name: "Tres" }] }) }], "Banditapai");
    const csv = toTuneMyMusicCsv(parsed, "Banditapai");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).not.toContain("\r");
    expect(csv.slice(1).split("\n")).toEqual([
      "Track name,Artist name,Album,Playlist name,Type,ISRC,Apple - id",
      '"Canción de Prueba","Uno, Dos & Tres","Álbum ""Especial""","Banditapai","Playlist","USAAA1500001",""',
    ]);
  });

  it("el CSV se vuelve a importar con el mismo parser sin perder datos", () => {
    const parsed = entriesToParsed([{ item: sp({}) }, { item: sp({ id: "c3", uri: "spotify:track:c3", name: "Otra, con coma", artists: [{ name: "X" }, { name: "Y" }] }) }], "Lista");
    const back = parsePlaylistFile(new TextEncoder().encode(toTuneMyMusicCsv(parsed, "Lista")));
    expect(back.playlistName).toBe("Lista");
    expect(back.tracks.map((t) => [t.title, t.primaryArtist, t.artist, t.album, t.isrc])).toEqual([
      ["Canción de Prueba", "Grupo Uno", "Grupo Uno", 'Álbum "Especial"', "USAAA1500001"],
      ["Otra, con coma", "X", "X, Y", 'Álbum "Especial"', "USAAA1500001"],
    ]);
  });

  it("nombre de archivo seguro", () => {
    expect(csvFileName('Mis "favoritas": 2026/10')).toBe("Mis favoritas 202610.csv");
    expect(csvFileName("   ")).toBe("playlist.csv");
  });
});

describe("importar directo de Spotify", () => {
  it("las canciones quedan vinculadas, con portada y duración, sin búsquedas", () => {
    const parsed = entriesToParsed([{ item: sp({}) }], "Lista");
    const { playlistId } = importPlaylist(db, "Lista", parsed);
    expect(playlistId).toBe(1);
    expect(getTrack(db, 1)).toMatchObject({
      spotify_uri: "spotify:track:a1",
      spotify_status: "matched",
      spotify_matched_via: "export",
      cover_url: "https://i.scdn.co/image/300",
      duration_sec: 185,
      isrc: "USAAA1500001",
    });
  });
});

describe("biblioteca de Spotify", () => {
  it("pide volver a conectar si la sesión no tiene permiso de leer playlists", () => {
    connect("user-modify-playback-state streaming");
    expect(hasLibraryScopes(db)).toBe(false);
    connect("streaming playlist-read-private playlist-read-collaborative user-library-read");
    expect(hasLibraryScopes(db)).toBe(true);
  });

  it("lista playlists (todas las páginas) y marca cuáles se pueden leer", async () => {
    connect("playlist-read-private");
    const pages: Record<string, unknown> = {
      "/me/playlists?limit=50": {
        items: [
          { id: "p1", name: "Mía", collaborative: false, owner: { id: "yo", display_name: "Yo" }, images: [], items: { total: 12 } },
          null,
        ],
        next: "https://api.spotify.com/v1/me/playlists?limit=50&offset=50",
        total: 3,
      },
      "/me/playlists?limit=50&offset=50": {
        items: [
          { id: "p2", name: "De otra persona", collaborative: false, owner: { id: "alguien", display_name: null }, images: null, tracks: { total: 5 } },
          { id: "p3", name: "Colaborativa", collaborative: true, owner: { id: "alguien", display_name: "Alguien" }, images: [], items: { total: 2 } },
        ],
        next: null,
        total: 3,
      },
    };
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = new URL(String(input));
      return json(pages[u.pathname.replace("/v1", "") + u.search]);
    }) as typeof fetch;
    const list = await listMyPlaylists(db, { fetchImpl });
    expect(list.map((p) => [p.id, p.owner, p.total, p.readable])).toEqual([
      ["p1", "Yo", 12, true],
      ["p2", "alguien", 5, false],
      ["p3", "Alguien", 2, true],
    ]);
  });

  it("usa /items para playlists y /me/tracks para 'Tus me gusta'", async () => {
    connect("playlist-read-private");
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      seen.push(new URL(String(input)).pathname);
      return json({ items: [{ item: sp({}) }], next: null, total: 1 });
    }) as typeof fetch;
    await getTracksOf(db, "abc", { fetchImpl });
    await getTracksOf(db, "liked", { fetchImpl });
    expect(seen).toEqual(["/v1/playlists/abc/items", "/v1/me/tracks"]);
  });
});

describe("agregar canciones o álbumes desde la búsqueda", () => {
  it("agrega al final de la lista sin repetir las que ya estaban", () => {
    const { playlistId } = importPlaylist(db, "Mía", entriesToParsed([{ item: sp({}) }], "Mía"));
    const more = entriesToParsed(
      [
        { item: sp({}) },
        { item: sp({ id: "n2", uri: "spotify:track:n2", name: "Nueva", external_ids: { isrc: "USAAA1500002" } }) },
        { item: sp({ id: "n3", uri: "spotify:track:n3", name: "Otra nueva", external_ids: { isrc: "USAAA1500003" } }) },
      ],
      "",
    );
    expect(addTracksToPlaylist(db, playlistId, more)).toEqual({ added: 2, already: 1 });
    const order = db
      .prepare("SELECT t.title FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id WHERE pt.playlist_id = ? ORDER BY pt.position")
      .all(playlistId)
      .map((r) => (r as { title: string }).title);
    expect(order).toEqual(["Canción de Prueba", "Nueva", "Otra nueva"]);
    expect(addTracksToPlaylist(db, playlistId, more)).toEqual({ added: 0, already: 3 });
  });

  it("la lista 'Agregadas desde Spotify' se crea una sola vez", () => {
    const a = getOrCreatePlaylist(db, ADDED_PLAYLIST_NAME, "spotify");
    const b = getOrCreatePlaylist(db, ADDED_PLAYLIST_NAME, "spotify");
    expect(a).toBe(b);
  });

  it("las canciones de un álbum toman su nombre y portada", async () => {
    connect("playlist-read-private");
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = new URL(String(input));
      if (u.pathname === "/v1/albums/alb1")
        return json({
          id: "alb1",
          name: "Disco Inventado",
          artists: [{ name: "Grupo Uno" }],
          images: [{ url: "https://i.scdn.co/image/a300", width: 300, height: 300 }],
          total_tracks: 2,
          tracks: { items: [{ ...sp({ id: "t1", uri: "spotify:track:t1", name: "Uno" }), album: undefined }], next: "https://api.spotify.com/v1/albums/alb1/tracks?offset=1&limit=1", total: 2 },
        });
      return json({ items: [{ ...sp({ id: "t2", uri: "spotify:track:t2", name: "Dos", external_ids: undefined }), album: undefined }], next: null, total: 2 });
    }) as typeof fetch;
    const { name, entries } = await getAlbumEntries(db, "alb1", { fetchImpl });
    const parsed = entriesToParsed(entries, name);
    expect(name).toBe("Disco Inventado");
    expect(parsed.tracks.map((t) => [t.title, t.album, t.coverUrl])).toEqual([
      ["Uno", "Disco Inventado", "https://i.scdn.co/image/a300"],
      ["Dos", "Disco Inventado", "https://i.scdn.co/image/a300"],
    ]);
  });

  it("la búsqueda en el catálogo respeta el bloqueo por cupo agotado", async () => {
    connect("playlist-read-private");
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('spotify_search_blocked_until', ?)").run(String(Date.now() + 60_000));
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return json({});
    }) as unknown as typeof fetch;
    await expect(searchCatalog(db, "algo", "track", { fetchImpl })).rejects.toMatchObject({ status: 429 });
    expect(called).toBe(false);
  });
});
