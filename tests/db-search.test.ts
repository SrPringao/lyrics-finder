import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type DB } from "@/lib/db";
import {
  deletePlaylist,
  getPlaylistSummary,
  getTrackLines,
  importPlaylist,
  listTracksWithoutLyrics,
  saveLyricsResult,
  saveManualLyrics,
  tracksToFetch,
} from "@/lib/db/repo";
import { fetchPlaylistLyrics } from "@/lib/import/fetcher";
import { Limiter } from "@/lib/lrclib/limiter";
import { parsePlaylistFile, type ParsedPlaylist } from "@/lib/parsers/playlist";
import { buildMatchQuery, parseQuery, searchLyrics, splitHighlighted } from "@/lib/search/fts";
import { chunkLines } from "@/lib/semantic/chunks";

// Letras inventadas para las pruebas.
const SYNCED_A = `[00:05.00] Tomé el tren nocturno hacia Madrid
[00:10.00] con la maleta llena de canciones
[00:15.00] y una foto tuya en el bolsillo
[00:20.00] la ciudad dormía sin razones`;
const PLAIN_B = "Mi carro se quedó sin gasolina\nen la carretera de MADRID a Toledo\nCanción triste de domingo";

const playlist = (titles: [string, string][]): ParsedPlaylist => ({
  source: "csv",
  encoding: "utf-8",
  delimiter: ",",
  skipped: 0,
  tracks: titles.map(([title, artist]) => ({
    title,
    artist,
    primaryArtist: artist,
    album: null,
    durationSec: 200,
    source: "csv",
  })),
});

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});

describe("importación", () => {
  it("importa el fixture de Spotify y comparte canciones entre playlists", () => {
    const parsed = parsePlaylistFile(new Uint8Array(readFileSync(new URL("../fixtures/spotify-exportify.csv", import.meta.url))));
    const a = importPlaylist(db, "Mis favoritas", parsed);
    const b = importPlaylist(db, "Copia", parsed);
    expect(a.trackCount).toBe(5);
    expect((db.prepare("SELECT COUNT(*) c FROM tracks").get() as { c: number }).c).toBe(5);
    expect(getPlaylistSummary(db, b.playlistId)).toMatchObject({ name: "Copia", source: "spotify", total: 5, pending: 5 });
  });

  it("deduplica ignorando mayúsculas y acentos", () => {
    importPlaylist(db, "x", playlist([["Canción", "Artista"], ["cancion", "ARTISTA"]]));
    expect((db.prepare("SELECT COUNT(*) c FROM tracks").get() as { c: number }).c).toBe(1);
  });

  it("borrar una playlist conserva las canciones que siguen en otra", () => {
    const a = importPlaylist(db, "a", playlist([["Uno", "X"], ["Dos", "X"]]));
    importPlaylist(db, "b", playlist([["Uno", "X"]]));
    deletePlaylist(db, a.playlistId);
    expect((db.prepare("SELECT title FROM tracks").all() as { title: string }[]).map((r) => r.title)).toEqual(["Uno"]);
  });
});

describe("letras y caché", () => {
  it("guarda letra sincronizada como líneas con tiempo, y la caché evita volver a pedirla", () => {
    const { playlistId } = importPlaylist(db, "p", playlist([["A", "X"], ["B", "Y"]]));
    const [a, b] = tracksToFetch(db, playlistId);
    saveLyricsResult(db, a.id, { status: "synced", syncedLyrics: SYNCED_A, plainLyrics: null, lrclibId: 1, matchedVia: "get" });
    saveLyricsResult(db, b.id, { status: "not_found", syncedLyrics: null, plainLyrics: null, lrclibId: null, matchedVia: null });

    expect(getTrackLines(db, a.id).map((l) => l.time_ms)).toEqual([5000, 10000, 15000, 20000]);
    // A ya tiene letra; B (not_found) se vuelve a intentar.
    expect(tracksToFetch(db, playlistId).map((t) => t.title)).toEqual(["B"]);
    expect(listTracksWithoutLyrics(db).map((t) => t.title)).toEqual(["B"]);
    expect(getPlaylistSummary(db, playlistId)).toMatchObject({ synced: 1, not_found: 1, pending: 0 });
  });

  it("letra manual: texto plano o LRC, y reemplaza el índice", () => {
    const { playlistId } = importPlaylist(db, "p", playlist([["A", "X"]]));
    const [a] = tracksToFetch(db, playlistId);
    expect(saveManualLyrics(db, a.id, PLAIN_B)).toBe("plain");
    expect(searchLyrics(db, "gasolina").tracks).toHaveLength(1);
    expect(saveManualLyrics(db, a.id, SYNCED_A)).toBe("synced");
    expect(searchLyrics(db, "gasolina").tracks).toHaveLength(0);
    expect(getTrackLines(db, a.id)[0].time_ms).toBe(5000);
    expect(saveManualLyrics(db, a.id, "   ")).toBe("not_found");
    expect(getTrackLines(db, a.id)).toHaveLength(0);
  });
});

describe("fetchPlaylistLyrics", () => {
  it("descarga, clasifica y registra errores sin detenerse", async () => {
    const { playlistId } = importPlaylist(db, "p", playlist([["Sync", "X"], ["Inst", "X"], ["Nada", "X"], ["Falla", "X"]]));
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const t = url.searchParams.get("track_name");
      const body = (o: object, status = 200) => new Response(JSON.stringify(o), { status });
      if (t === "Falla") return body({}, 400);
      if (url.pathname === "/api/search") return body([]);
      if (t === "Sync") return body({ id: 1, trackName: t, duration: 200, instrumental: false, plainLyrics: null, syncedLyrics: SYNCED_A });
      if (t === "Inst") return body({ id: 2, trackName: t, duration: 200, instrumental: true, plainLyrics: null, syncedLyrics: null });
      return body({}, 404);
    }) as typeof fetch;

    await fetchPlaylistLyrics(db, playlistId, { limiter: new Limiter(2), client: { fetchImpl: fakeFetch, maxRetries: 0 } });
    expect(getPlaylistSummary(db, playlistId)).toMatchObject({ synced: 1, instrumental: 1, not_found: 1, error: 1, pending: 0 });
  });
});

describe("búsqueda FTS", () => {
  function seed() {
    const p1 = importPlaylist(db, "Viajes", playlist([["Tren", "Banda"], ["Carro", "Solista"]]));
    const p2 = importPlaylist(db, "Otra", playlist([["Carro", "Solista"]]));
    const [tren, carro] = tracksToFetch(db, p1.playlistId);
    saveLyricsResult(db, tren.id, { status: "synced", syncedLyrics: SYNCED_A, plainLyrics: null, lrclibId: 1, matchedVia: "get" });
    saveLyricsResult(db, carro.id, { status: "plain", syncedLyrics: null, plainLyrics: PLAIN_B, lrclibId: 2, matchedVia: "get" });
    return { p1: p1.playlistId, p2: p2.playlistId };
  }

  it("no distingue mayúsculas ni acentos, y devuelve tiempo y contexto", () => {
    seed();
    const r = searchLyrics(db, "madrid");
    expect(r.tracks.map((t) => t.title).sort()).toEqual(["Carro", "Tren"]);
    const tren = r.tracks.find((t) => t.title === "Tren")!;
    expect(tren.hits[0]).toMatchObject({ timeMs: 5000, before: null, after: "con la maleta llena de canciones" });
    expect(splitHighlighted(tren.hits[0].highlighted)).toEqual([
      { text: "Tomé el tren nocturno hacia ", mark: false },
      { text: "Madrid", mark: true },
    ]);
    const carro = r.tracks.find((t) => t.title === "Carro")!;
    expect(carro.hits[0]).toMatchObject({ timeMs: null, before: "Mi carro se quedó sin gasolina", after: "Canción triste de domingo" });

    expect(searchLyrics(db, "cancion").totalLines).toBe(1); // "Canción" sí, "canciones" no
    expect(searchLyrics(db, "cancion*").totalLines).toBe(2);
    expect(searchLyrics(db, "TOME").totalLines).toBe(1);
  });

  it("frase exacta entre comillas", () => {
    seed();
    expect(searchLyrics(db, '"tren nocturno"').totalLines).toBe(1);
    expect(searchLyrics(db, '"nocturno tren"').totalLines).toBe(0);
    expect(searchLyrics(db, "nocturno tren").totalLines).toBe(1);
  });

  it("filtra por playlist", () => {
    const { p2 } = seed();
    expect(searchLyrics(db, "madrid", { playlistId: p2 }).tracks.map((t) => t.title)).toEqual(["Carro"]);
  });

  it("entrada rara no rompe FTS5", () => {
    seed();
    for (const q of ['madrid"', "AND", "(", "a-b:c", "***", "NEAR(x y)", "-", '""'])
      expect(() => searchLyrics(db, q)).not.toThrow();
    expect(buildMatchQuery("  ")).toBeNull();
    expect(buildMatchQuery('hola "me voy" mad*')).toBe('"hola" AND "me voy" AND "mad"*');
  });
});

describe("búsqueda 'contiene el texto'", () => {
  function seed() {
    const { playlistId } = importPlaylist(db, "Viajes", playlist([["Tren", "Banda"], ["Carro", "Solista"]]));
    const [tren, carro] = tracksToFetch(db, playlistId);
    saveLyricsResult(db, tren.id, { status: "synced", syncedLyrics: SYNCED_A, plainLyrics: null, lrclibId: 1, matchedVia: "get" });
    saveLyricsResult(db, carro.id, { status: "plain", syncedLyrics: null, plainLyrics: PLAIN_B, lrclibId: 2, matchedVia: "get" });
  }

  it("encuentra parte de una palabra, sin importar acentos ni mayúsculas", () => {
    seed();
    expect(searchLyrics(db, "madri").totalLines).toBe(0);
    const r = searchLyrics(db, "madri", { mode: "contiene" });
    expect(r.totalLines).toBe(2);
    const hit = r.tracks.find((t) => t.title === "Tren")!.hits[0];
    expect(splitHighlighted(hit.highlighted).filter((s) => s.mark)).toEqual([{ text: "Madri", mark: true }]);
    expect(searchLyrics(db, "DRID", { mode: "contiene" }).totalLines).toBe(2);
    expect(searchLyrics(db, "cancion", { mode: "contiene" }).totalLines).toBe(2); // "canciones" y "Canción"
    expect(searchLyrics(db, '"tren noct"', { mode: "contiene" }).totalLines).toBe(1);
  });

  it("ignora términos de menos de 3 letras y lo reporta", () => {
    seed();
    expect(parseQuery("ma tren", "contiene")).toEqual({ match: '"tren"', ignored: ["ma"] });
    const r = searchLyrics(db, "ma", { mode: "contiene" });
    expect(r).toMatchObject({ totalLines: 0, ignored: ["ma"] });
    expect(buildMatchQuery("mad*", "contiene")).toBe('"mad"');
  });

  it("el índice se mantiene al editar o borrar letras", () => {
    seed();
    const id = (db.prepare("SELECT id FROM tracks WHERE title = 'Carro'").get() as { id: number }).id;
    saveManualLyrics(db, id, "una letra distinta sin esa ciudad");
    expect(searchLyrics(db, "madri", { mode: "contiene" }).totalLines).toBe(1);
    saveManualLyrics(db, id, "");
    expect(searchLyrics(db, "distin", { mode: "contiene" }).totalLines).toBe(0);
  });
});

describe("fragmentos (fase 2)", () => {
  it("ventanas de 4 líneas con traslape de 2, cubriendo todo", () => {
    const lines = Array.from({ length: 7 }, (_, i) => ({ timeMs: i * 1000, text: `l${i}` }));
    expect(chunkLines(lines).map((c) => [c.startLine, c.endLine, c.startMs])).toEqual([
      [0, 3, 0],
      [2, 5, 2000],
      [4, 6, 4000],
    ]);
  });
});
