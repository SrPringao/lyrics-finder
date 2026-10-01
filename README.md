# Letras de mis playlists

Prototipo local para buscar palabras y frases dentro de las letras de tus playlists. Subes la exportación de una playlist y la app descarga las letras de [LRCLIB](https://lrclib.net). Al buscar, te muestra cada línea que coincide y el minuto:segundo donde se canta.

Es solo para uso personal: no tiene login, no está pensado para desplegarse y todo se queda en `./data/app.db`.

## Cómo correrlo

Necesitas Node 20 o más reciente (se probó con Node 24).

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # tests (vitest)
```

La base SQLite se crea sola en `./data/app.db`, que está en `.gitignore`. Si quieres usar otra ruta, define `LYRICS_DB_PATH=/ruta/a/otra.db`.

Cuando una actualización cambia la estructura de la base, la migración se aplica sola y antes deja un respaldo junto al original (por ejemplo, `data/app.backup-v1.db`).

## Reproducir en Spotify (requiere Premium)

Con Spotify conectado, cada timestamp de los resultados y de la letra se vuelve un botón de reproducir. Al picarle, la canción empieza a sonar desde ese momento, 1.5 s antes de la línea para que alcances a oírla completa. Puede sonar en el navegador o en cualquier dispositivo con Spotify abierto (celular, computadora, bocina); se elige en el selector del encabezado.

### Conectar

Pica **Conectar Spotify** en el encabezado, acepta en la pantalla de Spotify y listo. La app debe abrirse en **<http://127.0.0.1:3000>**, no en `localhost`, porque Spotify lo exige; si entras por `localhost`, el botón te cambia de dirección solo.

La app ya está registrada en Spotify y su Client ID viene en `src/config/spotify.ts`. No es secreto: con PKCE no hay client secret, y Spotify lo muestra en la URL de autorización. Para usar otra app registrada, define `SPOTIFY_CLIENT_ID` en `.env.local`.

### Quién puede conectarse

La app está en el "modo desarrollo" de Spotify: solo pueden iniciar sesión hasta **5 cuentas**, y el dueño tiene que agregar cada una a mano. Spotify ya no da permisos más amplios a personas, solo a empresas.

Para dar acceso a alguien:
1. Entra a <https://developer.spotify.com/dashboard>.
2. Abre la app y ve a **User Management**.
3. Agrega el nombre y el correo de su cuenta de Spotify.

Esa persona no tiene que configurar nada; solo pica **Conectar Spotify**.

### Cómo se vincula cada canción

- **CSV de Exportify:** ya trae el URI de Spotify, así que se usa directo.
- **CSV con ISRC** (TuneMyMusic, Soundiiz): se busca `isrc:XXXX`, que da la grabación exacta.
- **Sin ninguno de los dos** (por ejemplo, Apple Music): se busca por título y artista, y solo se acepta si ambos coinciden.

Al vincular se guarda también la **duración** según Spotify. Con eso se vuelven a buscar las letras que no se habían encontrado, porque LRCLIB acierta más cuando conoce la duración. Al conectar Spotify por primera vez se vinculan todas las playlists en segundo plano; después hay un botón **Vincular con Spotify** en la Biblioteca.

**Limitaciones:**
- Si la versión de Spotify (por ejemplo, un remaster) no es exactamente la misma que la de LRCLIB, el tiempo puede variar unos segundos.
- Safari y los navegadores de celular pueden bloquear el reproductor del navegador. En ese caso, elige tu celular o la app de escritorio en el selector.

## Exportar playlists

### Spotify (Exportify)

1. Entra a <https://exportify.net> e inicia sesión con Spotify.
2. Junto a la playlist que quieras, haz clic en **Export**. Se descarga un `.csv`.
3. En la app, ve a **Importar** y arrastra el CSV.

Las columnas se detectan por nombre, así que funcionan versiones viejas y nuevas de Exportify. Cuando una canción tiene varios artistas se guardan todos, pero las letras se buscan con el primero. Si el CSV incluye el URI de la canción, aparece un botón para abrirla en Spotify.

### Apple Music (Mac)

1. Abre la app **Música** y selecciona la playlist en la barra lateral.
2. Ve a **Archivo → Biblioteca → Exportar playlist…**.
3. Guárdala en formato **Texto Unicode** (`.txt`).
4. Arrastra ese `.txt` en **Importar**.

El archivo viene en UTF-16 y separado por tabulaciones, y la app lo detecta sola. También acepta los encabezados en español (Nombre, Artista, Álbum, Tiempo). En iTunes para Windows el menú es **Archivo → Biblioteca → Exportar lista**.

### Otros exportadores (TuneMyMusic, Soundiiz)

También se aceptan CSV con columnas como `Track name, Artist name, Album, Playlist name, ISRC`. Si el archivo trae el nombre de la playlist, se usa ese nombre cuando no escribes otro. Los artistas unidos con "," o "&" se separan, y las letras se buscan con el primero (si no aparece, se reintenta con el nombre completo).

## Cómo funciona

- **Importación:** el parser (`src/lib/parsers/playlist.ts`) detecta la codificación (UTF-8, UTF-16 con o sin BOM, o Windows-1252) y el delimitador, y normaliza cada fila a `{ title, artist, album, durationSec, source, spotifyUri?, isrc? }`. Cada canción se guarda una sola vez aunque esté en varias playlists: se reconoce primero por ISRC y luego por título + primer artista. Reimportar una playlist no duplica canciones ni vuelve a descargar letras que ya existen; solo crea otra entrada de playlist.
- **Letras:** el cliente (`src/lib/lrclib/client.ts`) primero limpia el título, quitando cosas como " - Remastered 2011" o "(feat. …)". Luego prueba `/api/get` y, si no encuentra, `/api/search`, eligiendo el resultado más cercano en duración (±3 s) y prefiriendo versiones sincronizadas. Hace como máximo 3 peticiones a la vez, compartidas entre todas las importaciones, y reintenta con backoff ante respuestas 429 o 5xx. Las canciones que ya tienen letra no se vuelven a pedir.
- **Estados por canción:** `synced`, `plain`, `instrumental`, `not_found` o `error` (falla de red o del servidor; se puede reintentar). Las letras que no se encuentran se pueden pegar a mano desde la vista de la canción. Si lo que pegas está en formato LRC (`[01:23.45] línea`), se guarda con sus tiempos.
- **Búsqueda:** usa SQLite FTS5 con `unicode61 remove_diacritics 2`, así que no importan las mayúsculas ni los acentos. Entre comillas busca una frase exacta, y `palabra*` busca por prefijo. La búsqueda es **por línea**, por lo que una frase partida entre dos líneas no aparece.
- **Progreso:** la importación responde de inmediato y las letras se descargan en segundo plano. La UI consulta el avance cada segundo, leyéndolo de la base. Si reinicias el servidor a mitad de una descarga, usa **Reintentar** en la Biblioteca para continuar.

## Estructura

```
src/lib/parsers/    playlist.ts (CSV/TXT), lrc.ts (LRC → líneas con ms)
src/lib/lrclib/     client.ts (get/search, limpieza, reintentos), limiter.ts
src/lib/db/         index.ts (conexión + migraciones), repo.ts (consultas)
src/lib/import/     fetcher.ts (descarga en segundo plano)
src/lib/search/     fts.ts (búsqueda + resaltado)
src/lib/semantic/   chunks.ts (fragmentos para la fase 2)
src/lib/spotify/    auth.ts (PKCE + tokens), api.ts (búsqueda, reproducir), resolver.ts (vincular canciones)
src/components/spotify/  SpotifyProvider (Web Playback SDK), SpotifyBar, PlayButton
src/app/            /importar, /buscar, /cancion/[id], /biblioteca, /api/*
fixtures/           archivos de ejemplo (regenerar: node fixtures/generate.mjs)
```

## Fase 2: búsqueda por significado (pendiente)

La base ya está preparada:

- Cada vez que se guarda una letra, se parte en fragmentos de 4 líneas que avanzan de 2 en 2 y se guardan en la tabla `lyric_chunks`, con el tiempo de inicio de cada uno.
- La tabla `chunk_embeddings (chunk_id, model, dim, vector BLOB)` existe, pero todavía está vacía.

Lo que falta:

1. `src/lib/semantic/embed.ts` con `@huggingface/transformers` y `Xenova/multilingual-e5-small`. Ojo: e5 usa los prefijos `passage: ` para los fragmentos y `query: ` para la consulta. Los vectores se guardan normalizados como `Float32Array`. Next ya excluye ese paquete del bundling.
2. Un proceso que genere embeddings para los fragmentos que todavía no tienen.
3. Una búsqueda que cargue los vectores en memoria y ordene por similitud coseno (con unos miles de fragmentos, un producto punto basta) y una página `/buscar/sentido`.
4. Opcional: mandar los 10 mejores fragmentos a la API de Claude para que elija y explique cuál encaja mejor.
