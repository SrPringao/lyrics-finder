import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

export type DB = Database.Database;

// Cada entrada es una migración; el índice + 1 es el `user_version` resultante.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE playlists (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL,              -- spotify | apple | csv
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE tracks (
    id                INTEGER PRIMARY KEY,
    dedupe_key        TEXT NOT NULL UNIQUE, -- título|primer artista normalizados
    title             TEXT NOT NULL,
    artist            TEXT NOT NULL,        -- todos los artistas
    primary_artist    TEXT NOT NULL,        -- el que se usa para buscar
    album             TEXT,
    duration_sec      INTEGER,
    spotify_uri       TEXT,
    lyrics_status     TEXT NOT NULL DEFAULT 'pending'
                      CHECK (lyrics_status IN ('pending','synced','plain','instrumental','not_found','error')),
    lyrics_source     TEXT CHECK (lyrics_source IN ('lrclib','manual')),
    lrclib_id         INTEGER,
    plain_lyrics      TEXT,
    synced_lyrics_raw TEXT,
    lyrics_error      TEXT,
    lyrics_updated_at TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX tracks_status ON tracks(lyrics_status);

  CREATE TABLE playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, position)
  );
  CREATE INDEX playlist_tracks_track ON playlist_tracks(track_id);

  CREATE TABLE lyric_lines (
    id         INTEGER PRIMARY KEY,
    track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    line_index INTEGER NOT NULL,
    time_ms    INTEGER,                     -- NULL si no está sincronizada
    text       TEXT NOT NULL,
    UNIQUE (track_id, line_index)
  );

  -- Índice de texto completo sobre lyric_lines.text (tabla de contenido externo).
  CREATE VIRTUAL TABLE lyric_lines_fts USING fts5(
    text,
    content = 'lyric_lines',
    content_rowid = 'id',
    tokenize = 'unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER lyric_lines_ai AFTER INSERT ON lyric_lines BEGIN
    INSERT INTO lyric_lines_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER lyric_lines_ad AFTER DELETE ON lyric_lines BEGIN
    INSERT INTO lyric_lines_fts(lyric_lines_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;
  CREATE TRIGGER lyric_lines_au AFTER UPDATE ON lyric_lines BEGIN
    INSERT INTO lyric_lines_fts(lyric_lines_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO lyric_lines_fts(rowid, text) VALUES (new.id, new.text);
  END;

  -- Fase 2 (búsqueda semántica): fragmentos de ~4 líneas y sus embeddings.
  -- Los fragmentos ya se generan al guardar cada letra; los embeddings quedan vacíos por ahora.
  CREATE TABLE lyric_chunks (
    id          INTEGER PRIMARY KEY,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    start_line  INTEGER NOT NULL,
    end_line    INTEGER NOT NULL,
    start_ms    INTEGER,
    text        TEXT NOT NULL,
    UNIQUE (track_id, chunk_index)
  );
  CREATE TABLE chunk_embeddings (
    chunk_id INTEGER NOT NULL REFERENCES lyric_chunks(id) ON DELETE CASCADE,
    model    TEXT NOT NULL,
    dim      INTEGER NOT NULL,
    vector   BLOB NOT NULL,                 -- Float32Array normalizado
    PRIMARY KEY (chunk_id, model)
  );
  `,
  // v2: ISRC / Apple ID, vinculación con Spotify y sesión de Spotify.
  `
  ALTER TABLE tracks ADD COLUMN isrc TEXT;
  ALTER TABLE tracks ADD COLUMN apple_id TEXT;
  -- NULL = sin intentar; matched = tiene spotify_uri; not_found = Spotify no la tiene
  ALTER TABLE tracks ADD COLUMN spotify_status TEXT CHECK (spotify_status IN ('matched','not_found'));
  ALTER TABLE tracks ADD COLUMN spotify_matched_via TEXT; -- export | isrc | search
  UPDATE tracks SET spotify_status = 'matched', spotify_matched_via = 'export' WHERE spotify_uri IS NOT NULL;
  CREATE INDEX tracks_isrc ON tracks(isrc);

  -- Una sola sesión (app local de un usuario).
  CREATE TABLE spotify_auth (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at    INTEGER NOT NULL,     -- epoch ms
    scope         TEXT,
    user_id       TEXT,
    display_name  TEXT,
    product       TEXT,                 -- premium | free
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
  // v3: ajustes guardados desde la UI (p. ej. el Client ID de Spotify).
  `
  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v4: índice por trigramas para buscar texto dentro de palabras ("madri" encuentra "Madrid").
  `
  CREATE VIRTUAL TABLE lyric_lines_tri USING fts5(
    text,
    content = 'lyric_lines',
    content_rowid = 'id',
    tokenize = 'trigram remove_diacritics 1'
  );
  CREATE TRIGGER lyric_lines_tri_ai AFTER INSERT ON lyric_lines BEGIN
    INSERT INTO lyric_lines_tri(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER lyric_lines_tri_ad AFTER DELETE ON lyric_lines BEGIN
    INSERT INTO lyric_lines_tri(lyric_lines_tri, rowid, text) VALUES ('delete', old.id, old.text);
  END;
  CREATE TRIGGER lyric_lines_tri_au AFTER UPDATE ON lyric_lines BEGIN
    INSERT INTO lyric_lines_tri(lyric_lines_tri, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO lyric_lines_tri(rowid, text) VALUES (new.id, new.text);
  END;
  -- Indexa las letras que ya estaban guardadas.
  INSERT INTO lyric_lines_tri(lyric_lines_tri) VALUES ('rebuild');
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function migrate(db: DB, target = MIGRATIONS.length): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current >= target) return;
  // Antes de cambiar una base con datos, deja un respaldo junto al archivo original.
  if (current > 0 && db.name !== ":memory:") {
    const backup = db.name.replace(/\.db$/, "") + `.backup-v${current}.db`;
    if (!existsSync(backup)) db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  }
  for (let v = current; v < target; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(file: string): DB {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

// Una sola conexión por proceso (sobrevive al hot reload de `next dev`).
const g = globalThis as unknown as { __lyricsDb?: DB };

export function getDb(): DB {
  g.__lyricsDb ??= openDb(process.env.LYRICS_DB_PATH ?? path.join(process.cwd(), "data", "app.db"));
  // La conexión sobrevive al hot reload, así que aplica migraciones nuevas sin reiniciar el servidor.
  migrate(g.__lyricsDb);
  return g.__lyricsDb;
}
