import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeBuffer,
  mapHeaders,
  parseDurationSeconds,
  parsePlaylistFile,
} from "@/lib/parsers/playlist";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe("parsePlaylistFile — Spotify (Exportify)", () => {
  const result = parsePlaylistFile(fixture("spotify-exportify.csv"));

  it("detecta formato y codificación", () => {
    expect(result.source).toBe("spotify");
    expect(result.encoding).toBe("utf-8");
    expect(result.delimiter).toBe(",");
  });

  it("normaliza las canciones y descarta filas vacías", () => {
    expect(result.tracks).toHaveLength(5);
    expect(result.skipped).toBe(1);
    expect(result.tracks[0]).toEqual({
      title: "Mr. Brightside",
      artist: "The Killers",
      primaryArtist: "The Killers",
      album: "Hot Fuss",
      durationSec: 223,
      source: "spotify",
      spotifyUri: "spotify:track:3n3Ppam7vgaVa1iaRUc9Lp",
    });
  });

  it("separa varios artistas y usa el primero para buscar", () => {
    const t = result.tracks[2];
    expect(t.artist).toBe("Luis Fonsi, Daddy Yankee, Justin Bieber");
    expect(t.primaryArtist).toBe("Luis Fonsi");
  });

  it("respeta comillas, comas y acentos dentro de campos", () => {
    expect(result.tracks[3].title).toBe("Canción, con coma");
    expect(result.tracks[3].album).toBe("Álbum ñandú");
  });

  it("no inventa URI para archivos locales", () => {
    expect(result.tracks[4].spotifyUri).toBeUndefined();
    expect(result.tracks[4].album).toBeNull();
  });

  it("acepta encabezados de otras versiones y BOM UTF-8", () => {
    const old = parsePlaylistFile(fixture("spotify-old-headers.csv"));
    expect(old.source).toBe("spotify");
    expect(old.tracks[0]).toMatchObject({ title: "Mr. Brightside", artist: "The Killers", durationSec: 223 });
  });
});

describe("parsePlaylistFile — Apple Music", () => {
  it("lee UTF-16LE con BOM, tabulaciones y fin de línea \\r", () => {
    const r = parsePlaylistFile(fixture("apple-music.txt"));
    expect(r.source).toBe("apple");
    expect(r.encoding).toBe("utf-16le");
    expect(r.delimiter).toBe("\t");
    expect(r.tracks).toHaveLength(3);
    expect(r.tracks[0]).toEqual({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      primaryArtist: "Queen",
      album: "A Night at the Opera",
      durationSec: 355,
      source: "apple",
    });
    expect(r.tracks[2]).toMatchObject({ title: "Sin Duración", album: null, durationSec: null });
  });

  it("lee encabezados en español, UTF-16 sin BOM y tiempo m:ss", () => {
    const r = parsePlaylistFile(fixture("apple-music-es.txt"));
    expect(r.encoding).toBe("utf-16le");
    expect(r.tracks[0]).toMatchObject({ title: "Oye Cómo Va", artist: "Santana", album: "Abraxas", durationSec: 257 });
  });
});

describe("parsePlaylistFile — TuneMyMusic / Soundiiz", () => {
  const r = parsePlaylistFile(fixture("tunemymusic.csv"));

  it("lee ISRC, ID de Apple y el nombre de la playlist", () => {
    expect(r.source).toBe("csv");
    expect(r.playlistName).toBe("Banditapai");
    expect(r.tracks[0]).toEqual({
      title: "Hablemos",
      artist: "Ariel Camacho Y Los Plebes del Rancho",
      primaryArtist: "Ariel Camacho Y Los Plebes del Rancho",
      album: "Hablemos",
      durationSec: null,
      source: "csv",
      isrc: "USE7D1500142",
      appleId: "1050889337",
    });
  });

  it("separa artistas unidos con coma y &, y normaliza el ISRC", () => {
    expect(r.tracks[1]).toMatchObject({ artist: "Natanael Cano, Junior H, Ovi", primaryArtist: "Natanael Cano", isrc: "USUM71603498" });
    expect(r.tracks[2]).toMatchObject({ primaryArtist: "Grupo Firme", album: null });
    expect(r.tracks[2].isrc).toBeUndefined();
  });

  it("Exportify no parte por & (un nombre como 'Simon & Garfunkel' es un solo artista)", () => {
    const sp = parsePlaylistFile('Track Name,Artist Name(s),Duration (ms)\n"The Boxer","Simon & Garfunkel",300000');
    expect(sp.tracks[0].primaryArtist).toBe("Simon & Garfunkel");
  });
});

describe("utilidades", () => {
  it("no confunde 'Album Artist Name(s)' con el artista", () => {
    const m = mapHeaders(["Album Artist Name(s)", "Track Name", "Artist Name(s)", "Album Name"]);
    expect(m.artist).toBe("Artist Name(s)");
    expect(m.album).toBe("Album Name");
  });

  it("encuentra columnas con nombres aproximados", () => {
    const m = mapHeaders(["Song Title", "Main Artist", "Track Duration (ms)"]);
    expect(m).toMatchObject({ title: "Song Title", artist: "Main Artist", durationMs: "Track Duration (ms)" });
  });

  it("parsea duraciones", () => {
    expect(parseDurationSeconds("245")).toBe(245);
    expect(parseDurationSeconds("4:05")).toBe(245);
    expect(parseDurationSeconds("1:02:03")).toBe(3723);
    expect(parseDurationSeconds("")).toBeNull();
  });

  it("decodifica latin-1 si no es UTF-8 válido", () => {
    const bytes = new Uint8Array([0x43, 0x61, 0x6e, 0x63, 0x69, 0xf3, 0x6e]); // "Canción" en windows-1252
    expect(decodeBuffer(bytes)).toEqual({ text: "Canción", encoding: "windows-1252" });
  });

  it("da un error claro si no hay columna de título", () => {
    expect(() => parsePlaylistFile("foo,bar\n1,2")).toThrow(/columna de título/);
  });
});
