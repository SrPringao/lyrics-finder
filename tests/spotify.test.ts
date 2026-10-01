import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, openDb, SCHEMA_VERSION, type DB } from "@/lib/db";
import { getPlaylistSummary, getTrack, importPlaylist, saveLyricsResult } from "@/lib/db/repo";
import { Limiter } from "@/lib/lrclib/limiter";
import { parsePlaylistFile } from "@/lib/parsers/playlist";
import { getSearchBlockedUntil, pickBestTextMatch, playTrack, searchByIsrc, spotifyFetch, type SpotifyTrack } from "@/lib/spotify/api";
import { SPOTIFY_CLIENT_ID } from "@/config/spotify";
import { buildAuthorizeUrl, challengeFor, getAuth, getClientId, isValidClientId, saveClientId, saveTokens } from "@/lib/spotify/auth";
import { resolvePlaylist } from "@/lib/spotify/resolver";
import Database from "better-sqlite3";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers });

const spTrack = (over: Partial<SpotifyTrack>): SpotifyTrack => ({
  id: "abc",
  uri: "spotify:track:abc",
  name: "Canción",
  duration_ms: 200_000,
  artists: [{ name: "Artista" }],
  album: { name: "Álbum" },
  is_playable: true,
  ...over,
});

function connect(db: DB) {
  saveTokens(db, { access_token: "tok1", refresh_token: "ref1", expires_in: 3600 }, { id: "u", display_name: "Yo", product: "premium" });
}

describe("PKCE y login", () => {
  it("calcula el code_challenge S256 (vector de RFC 7636)", () => {
    expect(challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("arma la URL de autorización con los scopes de reproducción", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:3000/api/spotify/callback", state: "s", verifier: "v" }));
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("user-modify-playback-state");
    expect(url.searchParams.get("scope")).toContain("streaming");
  });
});

describe("Client ID", () => {
  it("viene en el código, .env.local lo sobrescribe, y cambiarlo desde la UI cierra la sesión", () => {
    const prev = process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_ID;
    try {
      const db = openDb(":memory:");
      // Sin .env.local se usa el que viene en el código.
      expect(getClientId(db)).toBe(SPOTIFY_CLIENT_ID || null);
      expect(isValidClientId(SPOTIFY_CLIENT_ID)).toBe(true);
      expect(isValidClientId("abc")).toBe(false);
      expect(isValidClientId("0123456789abcdef0123456789ABCDEF")).toBe(true);
      saveClientId(db, " 0123456789abcdef0123456789abcdef ");
      expect(db.prepare("SELECT value FROM app_settings").get()).toEqual({ value: "0123456789abcdef0123456789abcdef" });
      connect(db);
      saveClientId(db, "ffffffffffffffffffffffffffffffff");
      expect(getAuth(db)).toBeUndefined();
      process.env.SPOTIFY_CLIENT_ID = "env-gana";
      expect(getClientId(db)).toBe("env-gana");
    } finally {
      if (prev === undefined) delete process.env.SPOTIFY_CLIENT_ID;
      else process.env.SPOTIFY_CLIENT_ID = prev;
    }
  });
});

describe("migración v1 → v2", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "letras-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("conserva canciones, letras e índice, y deja un respaldo", () => {
    const file = path.join(dir, "app.db");
    const v1 = new Database(file);
    v1.pragma("foreign_keys = ON");
    migrate(v1, 1);
    const old = openDbV1Data(v1);
    v1.close();

    const db = openDb(file);
    expect(db.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
    expect(existsSync(path.join(dir, "backups", "app.backup-v1.db"))).toBe(true);
    const t = getTrack(db, old.trackId)!;
    expect(t).toMatchObject({ title: "Vieja", lyrics_status: "synced", spotify_status: "matched", spotify_matched_via: "export", isrc: null });
    const hits = db.prepare("SELECT COUNT(*) c FROM lyric_lines_fts WHERE lyric_lines_fts MATCH 'inventada'").get() as { c: number };
    expect(hits.c).toBe(1);
    // El índice por trigramas (v4) también indexa las letras que ya existían.
    const tri = db.prepare("SELECT COUNT(*) c FROM lyric_lines_tri WHERE lyric_lines_tri MATCH 'vent'").get() as { c: number };
    expect(tri.c).toBe(1);
    db.close();
  });
});

function openDbV1Data(db: Database.Database) {
  db.prepare("INSERT INTO playlists (id, name, source) VALUES (1, 'p', 'spotify')").run();
  const trackId = Number(
    db
      .prepare(
        "INSERT INTO tracks (dedupe_key, title, artist, primary_artist, spotify_uri, lyrics_status) VALUES ('vieja|x', 'Vieja', 'X', 'X', 'spotify:track:old', 'synced')",
      )
      .run().lastInsertRowid,
  );
  db.prepare("INSERT INTO playlist_tracks VALUES (1, ?, 0)").run(trackId);
  db.prepare("INSERT INTO lyric_lines (track_id, line_index, time_ms, text) VALUES (?, 0, 1000, 'una línea inventada')").run(trackId);
  return { trackId };
}

describe("reimportar sin duplicar", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("reconoce canciones importadas antes con el artista completo ('A, B & C') y les agrega el ISRC", () => {
    // Así quedaban guardadas antes de separar artistas con "&".
    db.prepare(
      `INSERT INTO tracks (dedupe_key, title, artist, primary_artist, lyrics_status)
       VALUES ('la vida ruina feat ariel camacho|natanael cano junior h and ovi', 'La Vida Ruina (feat. Ariel Camacho)',
               'Natanael Cano, Junior H & Ovi', 'Natanael Cano, Junior H & Ovi', 'synced')`,
    ).run();
    const parsed = parsePlaylistFile(fixture("tunemymusic.csv"));
    importPlaylist(db, "a", parsed);
    expect((db.prepare("SELECT COUNT(*) c FROM tracks").get() as { c: number }).c).toBe(3);
    const t = db.prepare("SELECT * FROM tracks WHERE title LIKE 'La Vida Ruina%'").get() as { isrc: string; lyrics_status: string };
    expect(t).toMatchObject({ isrc: "USUM71603498", lyrics_status: "synced" });

    importPlaylist(db, "b", parsed);
    expect((db.prepare("SELECT COUNT(*) c FROM tracks").get() as { c: number }).c).toBe(3);
  });

  it("dos títulos distintos con el mismo ISRC son la misma grabación", () => {
    importPlaylist(db, "a", parsePlaylistFile('Track name,Artist name,ISRC\n"Canción - Remastered","X","USAAA1500001"'));
    importPlaylist(db, "b", parsePlaylistFile('Track name,Artist name,ISRC\n"Canción","X","USAAA1500001"'));
    expect((db.prepare("SELECT COUNT(*) c FROM tracks").get() as { c: number }).c).toBe(1);
  });
});

describe("pickBestTextMatch", () => {
  it("exige título y artista, y prefiere la duración más cercana", () => {
    const items = [
      spTrack({ id: "1", name: "Otra", artists: [{ name: "Artista" }] }),
      spTrack({ id: "2", name: "Canción", artists: [{ name: "Alguien más" }] }),
      spTrack({ id: "3", name: "Canción - Remastered 2011", duration_ms: 250_000 }),
      spTrack({ id: "4", name: "Cancion (feat. Otro)", duration_ms: 201_000 }),
    ];
    expect(pickBestTextMatch(items, { title: "Canción", artist: "Artista", durationSec: 200 })?.id).toBe("4");
    expect(pickBestTextMatch(items.slice(0, 2), { title: "Canción", artist: "Artista" })).toBeNull();
  });
});

describe("cliente Spotify", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    process.env.SPOTIFY_CLIENT_ID = "cid";
  });

  it("ante 401 refresca el token y reintenta; conserva el refresh token si no llega uno nuevo", async () => {
    connect(db);
    const seen: string[] = [];
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("accounts.spotify.com/api/token")) {
        expect(String(init?.body)).toContain("refresh_token=ref1");
        return json({ access_token: "tok2", expires_in: 3600 });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      seen.push(auth);
      return auth === "Bearer tok1" ? json({}, 401) : json({ devices: [] });
    }) as typeof fetch;
    await spotifyFetch(db, "/me/player/devices", {}, { fetchImpl: fakeFetch });
    expect(seen).toEqual(["Bearer tok1", "Bearer tok2"]);
    expect(getAuth(db)).toMatchObject({ access_token: "tok2", refresh_token: "ref1" });
  });

  it("playTrack manda uri, position_ms y device_id", async () => {
    connect(db);
    let call: { url: string; body: unknown; method?: string } | null = null;
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      call = { url: String(input), body: JSON.parse(String(init?.body)), method: init?.method };
      return json(null, 204);
    }) as typeof fetch;
    await playTrack(db, { uri: "spotify:track:x", positionMs: 61_500.4, deviceId: "dev 1" }, { fetchImpl: fakeFetch });
    expect(call).toEqual({
      url: "https://api.spotify.com/v1/me/player/play?device_id=dev%201",
      method: "PUT",
      body: { uris: ["spotify:track:x"], position_ms: 61500 },
    });
  });

  it("resolvePlaylist vincula por ISRC (y toma duración y artista) o por texto, y marca las que no existen", async () => {
    connect(db);
    const { playlistId } = importPlaylist(db, "p", parsePlaylistFile(fixture("tunemymusic.csv")));
    const fakeFetch = (async (input: string | URL | Request) => {
      const q = new URL(String(input)).searchParams.get("q") ?? "";
      if (q === "isrc:USE7D1500142")
        return json({ tracks: { items: [spTrack({ uri: "spotify:track:hab", name: "Hablemos", duration_ms: 185_400, artists: [{ name: "Ariel Camacho" }], external_ids: { isrc: "USE7D1500142" } })] } });
      if (q.startsWith("isrc:")) return json({ tracks: { items: [] } });
      if (q.includes("Sin ISRC") && q.includes("Grupo Firme"))
        return json({ tracks: { items: [spTrack({ uri: "spotify:track:sin", name: "Sin ISRC", artists: [{ name: "Grupo Firme" }] })] } });
      return json({ tracks: { items: [] } });
    }) as typeof fetch;

    await resolvePlaylist(db, playlistId, { fetchImpl: fakeFetch, limiter: new Limiter(2) });
    const rows = db.prepare("SELECT title, primary_artist, duration_sec, spotify_uri, spotify_status, spotify_matched_via FROM tracks ORDER BY id").all();
    expect(rows).toEqual([
      { title: "Hablemos", primary_artist: "Ariel Camacho", duration_sec: 185, spotify_uri: "spotify:track:hab", spotify_status: "matched", spotify_matched_via: "isrc" },
      { title: "La Vida Ruina (feat. Ariel Camacho)", primary_artist: "Natanael Cano", duration_sec: null, spotify_uri: null, spotify_status: "not_found", spotify_matched_via: null },
      { title: "Sin ISRC", primary_artist: "Grupo Firme", duration_sec: 200, spotify_uri: "spotify:track:sin", spotify_status: "matched", spotify_matched_via: "search" },
    ]);
    expect(getPlaylistSummary(db, playlistId)).toMatchObject({ spotify_matched: 2, spotify_not_found: 1 });
  });

  it("cupo agotado: no espera el Retry-After, anota el bloqueo y deja de buscar", async () => {
    connect(db);
    let calls = 0;
    const sleeps: number[] = [];
    const fakeFetch = (async () => {
      calls++;
      return json({ error: { status: 429, message: "Too many requests", reason: "QUOTA_EXCEEDED" } }, 429, { "retry-after": "86019" });
    }) as unknown as typeof fetch;
    const opts = { fetchImpl: fakeFetch, sleep: async (ms: number) => void sleeps.push(ms) };

    await expect(searchByIsrc(db, "USAAA1500001", opts)).rejects.toMatchObject({ status: 429, reason: "QUOTA_EXCEEDED" });
    expect(sleeps).toEqual([]);
    expect(getSearchBlockedUntil(db)).toBeGreaterThan(Date.now() + 86_000_000);

    // Mientras dure el bloqueo ya no se llama a Spotify.
    await expect(searchByIsrc(db, "USAAA1500001", opts)).rejects.toMatchObject({ status: 429 });
    const { playlistId } = importPlaylist(db, "p", parsePlaylistFile(fixture("tunemymusic.csv")));
    await resolvePlaylist(db, playlistId, { ...opts, limiter: new Limiter(2) });
    expect(calls).toBe(1);
  });

  it("un 429 breve sí se reintenta", async () => {
    connect(db);
    let n = 0;
    const sleeps: number[] = [];
    const fakeFetch = (async () => (++n === 1 ? json({}, 429, { "retry-after": "2" }) : json({ tracks: { items: [] } }))) as unknown as typeof fetch;
    await searchByIsrc(db, "USAAA1500001", { fetchImpl: fakeFetch, sleep: async (ms) => void sleeps.push(ms) });
    expect(sleeps).toEqual([2000]);
    expect(getSearchBlockedUntil(db)).toBeNull();
  });

  it("vincular no borra letras ya guardadas", async () => {
    connect(db);
    const { playlistId } = importPlaylist(db, "p", parsePlaylistFile(fixture("tunemymusic.csv")));
    saveLyricsResult(db, 1, { status: "plain", plainLyrics: "línea inventada", syncedLyrics: null, lrclibId: 9, matchedVia: "get" });
    const fakeFetch = (async () => json({ tracks: { items: [] } })) as unknown as typeof fetch;
    await resolvePlaylist(db, playlistId, { fetchImpl: fakeFetch, limiter: new Limiter(2) });
    expect(getTrack(db, 1)).toMatchObject({ lyrics_status: "plain", plain_lyrics: "línea inventada" });
  });
});
