// Genera los archivos de ejemplo usados por los tests: node fixtures/generate.mjs
import { writeFileSync } from "node:fs";

const dir = new URL(".", import.meta.url);

// Exportify (CSV UTF-8, comillas, varios artistas separados por coma)
const spotify = [
  '"Track URI","Track Name","Album Name","Artist Name(s)","Album Artist Name(s)","Release Date","Duration (ms)","Popularity","Added At"',
  '"spotify:track:3n3Ppam7vgaVa1iaRUc9Lp","Mr. Brightside","Hot Fuss","The Killers","The Killers","2004-06-07","222973","85","2024-01-01T00:00:00Z"',
  '"spotify:track:0VjIjW4GlUZAMYd2vXMi3b","Blinding Lights","After Hours","The Weeknd","The Weeknd","2020-03-20","200040","90","2024-01-01T00:00:00Z"',
  '"spotify:track:6habFhsOp2NvshLv26DqMb","Despacito - Remix","Despacito Feat. Justin Bieber (Remix)","Luis Fonsi,Daddy Yankee,Justin Bieber","Luis Fonsi","2017-04-17","228826","70","2024-01-01T00:00:00Z"',
  '"spotify:track:7qiZfU4dY1lWllzX7mPBI3","Canción, con coma","Álbum ñandú","Artista Ñ","Artista Ñ","2020","180500","10","2024-01-01T00:00:00Z"',
  '"spotify:local:Foo:Bar:Local+Song:200","Local Song","","Foo","","","200000","0",""',
  '"","","Album sin título","Alguien","","","1000","",""',
  '',
].join("\n");
writeFileSync(new URL("spotify-exportify.csv", dir), spotify, "utf8");

// Variante con encabezados algo distintos (versiones viejas de Exportify)
const spotifyOld = [
  "Spotify ID,Artist IDs,Track Name,Album Name,Artist Name(s),Release Date,Duration (ms)",
  "3n3Ppam7vgaVa1iaRUc9Lp,0C0XlULifJtAgn6ZNCW2eu,Mr. Brightside,Hot Fuss,The Killers,2004-06-07,222973",
].join("\n");
writeFileSync(new URL("spotify-old-headers.csv", dir), "﻿" + spotifyOld, "utf8");

// Apple Music: UTF-16LE con BOM, tabulaciones, fin de línea \r
const appleHeader = ["Name", "Artist", "Composer", "Album", "Grouping", "Genre", "Size", "Time", "Disc Number", "Year", "Date Added", "Plays", "Location"];
const appleRows = [
  ["Bohemian Rhapsody", "Queen", "Freddie Mercury", "A Night at the Opera", "", "Rock", "8573123", "355", "1", "1975", "1/1/24, 10:00", "12", ""],
  ["Hey Jude - Remastered 2015", "The Beatles", "Lennon-McCartney", "1 (Remastered)", "", "Rock", "1", "425", "1", "1968", "", "", ""],
  ["Sin Duración", "Alguien", "", "", "", "", "", "", "", "", "", "", ""],
];
const appleText = [appleHeader, ...appleRows].map((r) => r.join("\t")).join("\r") + "\r";
writeFileSync(new URL("apple-music.txt", dir), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(appleText, "utf16le")]));

// Apple Music en español y sin BOM (UTF-16LE), con tiempo "m:ss"
const esHeader = ["Nombre", "Artista", "Álbum", "Tiempo"];
const esRows = [["Oye Cómo Va", "Santana", "Abraxas", "4:17"]];
const esText = [esHeader, ...esRows].map((r) => r.join("\t")).join("\n");
writeFileSync(new URL("apple-music-es.txt", dir), Buffer.from(esText, "utf16le"));
// TuneMyMusic / Soundiiz: CSV UTF-8 con BOM, sin duración, con ISRC e ID de Apple
const tmm = [
  "Track name,Artist name,Album,Playlist name,Type,ISRC,Apple - id",
  '"Hablemos","Ariel Camacho Y Los Plebes del Rancho","Hablemos","Banditapai","Playlist","USE7D1500142","1050889337"',
  '"La Vida Ruina (feat. Ariel Camacho)","Natanael Cano, Junior H & Ovi","Álbum X","Banditapai","Playlist","usum7-1603498","1443825130"',
  '"Sin ISRC","Grupo Firme & Carin leon","","Banditapai","Playlist","","123"',
].join("\n");
writeFileSync(new URL("tunemymusic.csv", dir), "\uFEFF" + tmm, "utf8");
console.log("fixtures generados");
