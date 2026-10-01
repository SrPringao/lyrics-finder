# Letras de mis playlists — contexto para rediseño

Este documento describe la aplicación tal como está hoy: qué hace, qué pantallas tiene, cómo se ve cada una, qué estados maneja y qué restricciones hay. Sirve de punto de partida para proponer un diseño nuevo que después se implementará en el código existente.

---

## 1. Qué es la aplicación

Una app web personal para **buscar palabras o frases dentro de las letras de las canciones de mis playlists** y saber en qué segundo exacto se dicen.

Flujo principal:
1. Importo un archivo exportado de una playlist (Spotify, Apple Music o TuneMyMusic).
2. La app descarga automáticamente la letra de cada canción desde LRCLIB, de preferencia con tiempos por línea.
3. Busco una palabra (por ejemplo "Madrid") y la app muestra todas las canciones que la mencionan, la línea exacta, una línea de contexto antes y después, y el minuto:segundo.
4. Con Spotify conectado (cuenta Premium), cada minuto:segundo es un botón: al picarlo, la canción empieza a sonar desde ese momento.

Contexto de uso:
- Uso personal y para unos pocos amigos. Hoy corre local (`npm run dev`) en mi computadora; más adelante podría publicarse.
- Biblioteca real actual: 2 playlists ("Banditapai", 531 canciones, y "My Apple Music Library", 1,264 canciones), 1,562 canciones en total, unas 65,000 líneas de letra. La mayoría de las letras son sincronizadas (con tiempos). Música mayormente en español (regional mexicano, corridos, banda, pop latino).
- Idioma de toda la interfaz: **español (México)**.

## 2. Restricciones de diseño

- **Sin emojis** en ningún lugar de la interfaz ni del contenido. Los iconos deben ser SVG (o texto).
- Todos los textos en español.
- **No usar letras de canciones reales en los mockups.** Usar letras inventadas como relleno (por ejemplo: "Tomé el tren nocturno hacia Madrid / con la maleta llena de canciones"). Los títulos y artistas reales sí se pueden usar.
- Debe funcionar en escritorio y verse bien en celular (ancho de 375 px).
- El diseño se implementará con **Next.js 16 (App Router) + React 19 + Tailwind CSS v4**. Conviene que la propuesta se pueda expresar en clases de Tailwind o en tokens CSS (colores, radios, sombras, tipografías).
- La fuente actual es Geist (sans y mono, de Google Fonts). Se puede cambiar.
- Spotify impone dos cosas que el diseño debe contemplar:
  - Para reproducir hace falta cuenta Premium.
  - La app debe abrirse en `http://127.0.0.1:3000` y no en `localhost`; el login de Spotify redirige solo.
- El botón verde de Spotify usa su color oficial `#1DB954` (hover `#1aa34a`). Si se usa la marca de Spotify, hay que respetar sus lineamientos.

## 3. Sistema visual actual

Hoy el diseño es funcional y sencillo, sin identidad propia. Es lo que se quiere mejorar.

**Colores**

Fondo y texto:

| Uso | Valor |
|---|---|
| Fondo de la página | `#faf9f7` (blanco cálido) |
| Texto principal | `#1c1917` (stone-900) |
| Texto secundario | stone-500 / stone-600 |
| Texto deshabilitado | stone-400 |
| Bordes | stone-200 / stone-300 |
| Tarjetas | blanco con borde stone-200, `rounded-xl` y sombra pequeña |

Acciones:

| Uso | Valor |
|---|---|
| Botón primario | stone-900, hover stone-700, texto blanco |
| Botón secundario | blanco con borde stone-300, hover stone-50 |
| Acento | esmeralda (emerald-500 a 800): botones de reproducir, enlaces de tiempo, barra de progreso |
| Marca de Spotify | `#1DB954` |

Resaltados:

| Uso | Valor |
|---|---|
| Palabra encontrada | `<mark>` amarillo `#fde68a` |
| Línea enlazada desde un resultado | fondo `#fef3c7` |

Estados de la letra (pastillas redondas, fondo claro con texto oscuro del mismo tono):

| Estado | Color |
|---|---|
| Sincronizada | verde (emerald-100 / 800) |
| Sin tiempos | azul (sky-100 / 800) |
| Instrumental | violeta (violet-100 / 800) |
| No encontrada | ámbar (amber-100 / 800) |
| Error | rojo (red-100 / 800) |
| Pendiente | gris (stone-100 / 600) |

Mensajes:

| Tipo | Valor |
|---|---|
| Error | red-50 de fondo, texto red-700 |
| Aviso | amber-50 de fondo, texto amber-800 |

**Tipografía**
- Geist Sans para todo.
- Geist Mono para tiempos (`1:23`) e identificadores.
- Títulos de página: `text-2xl font-semibold tracking-tight`.
- Cuerpo: `text-sm`.
- Metadatos: `text-xs`.

**Layout**
- Columna central de ancho máximo 896 px (`max-w-4xl`), con márgenes laterales de 16 px.
- Encabezado fijo arriba (sticky), blanco translúcido con desenfoque.
- No hay modo oscuro.

**Iconos**
- Solo tres iconos SVG propios: reproducir (triángulo), pausa (dos barras) y cargando (spinner).

## 4. Navegación y encabezado (en todas las pantallas)

Encabezado fijo con:
- **A la izquierda:**
  - El nombre "Letras" (texto, sin logo).
  - Enlaces: **Buscar**, **Importar**, **Biblioteca**.
- **A la derecha, la zona de Spotify**, que cambia según el estado:
  - **Sin conectar:** botón verde "Conectar Spotify".
  - **Conectado:**
    - Si algo está sonando en el navegador, una mini-pastilla "Ahora suena": icono de pausa o reproducir más "Título — Artista", y al hacer clic pausa o reanuda.
    - Un selector "Dónde se reproduce": "Este navegador", con la nota "(conectando…)" o "(no disponible)" cuando aplica, más los dispositivos de Spotify del usuario, como "iPhone de Franco (celular)" o "MacBook (computadora)".
    - El nombre de la cuenta ("Franco Aldrete"; si no es Premium, agrega "(no Premium)").
    - Un enlace "Salir".
- **Notificaciones (toast):** abajo al centro, fondo oscuro, o rojo si es error. Desaparecen solas (3 s, o 8 s si es error). Ejemplos:
  - "No hay ningún dispositivo de Spotify activo…"
  - "Spotify pausó las búsquedas de esta app hasta el jueves 10:45 p.m. (se agotó el cupo diario)."

La ruta `/` no tiene contenido propio: redirige a Buscar si hay playlists, o a Importar si no hay ninguna.

## 5. Pantallas

### 5.1 Buscar (`/buscar`) — la pantalla principal

**Formulario:**
- Caja de texto grande, con placeholder `Busca una palabra o "una frase exacta"…`.
- Selector de playlist: "Todas las playlists" o una en particular.
- Botón "Buscar".
- Debajo, un selector de dos opciones en forma de pastillas (la elegida va rellena en negro):
  - **Palabra completa:** "madrid" encuentra "Madrid", pero "madri" no.
  - **Contiene el texto:** "madri" también encuentra "Madrid". Cada término necesita al menos 3 letras.
- Junto a las opciones, una frase corta que explica el modo elegido.

**Estados:**
- **Sin playlists:** "Aún no hay playlists. Importa una para empezar."
- **Sin búsqueda todavía:** consejos ("no importan mayúsculas ni acentos · usa comillas para frases exactas · con 'Contiene el texto' puedes escribir solo una parte de la palabra").
- **Con resultados:** resumen "23 líneas en 12 canciones" (si hay más de 500 líneas, agrega "(mostrando las primeras)").
- **Sin resultados:** "Sin resultados." En modo palabra completa sugiere probar "Contiene el texto".
- **Términos ignorados:** aviso ámbar cuando en "contiene" se escribió algo de menos de 3 letras: "Se ignoró 'ma': … al menos 3 letras."

**Resultados:** una tarjeta por canción, ordenadas por número de menciones.
- **Encabezado de la tarjeta:**
  - Título (enlace a la vista de la canción).
  - Artista y álbum en gris.
  - Pastilla de Spotify, que tiene tres estados:
    - "Vinculada a Spotify" (verde): se puede reproducir desde cualquier segundo.
    - "Sin vincular" (gris): se vincula sola la primera vez que se le da play.
    - "No está en Spotify" (rojo).
  - Contador "3 menciones".
  - Botón verde:
    - "Abrir en Spotify" si está vinculada: abre la canción exacta.
    - "Buscar en Spotify" si no: abre la búsqueda de Spotify con título y artista.
- **Cada coincidencia** (una fila por línea encontrada):
  - **A la izquierda, el tiempo:**
    - Con Spotify conectado: una pastilla verde clara con icono de reproducir y "1:23". Mientras arranca muestra un spinner.
    - Sin Spotify conectado: el tiempo es un enlace a esa línea dentro de la letra.
    - Si la letra no tiene tiempos: "—".
  - **A la derecha, tres líneas:**
    - La línea anterior, en gris claro y truncada.
    - La línea encontrada, con la palabra resaltada en amarillo.
    - La línea siguiente, en gris claro y truncada.

### 5.2 Canción (`/cancion/[id]`)

**Encabezado:**
- Título grande.
- Artista · álbum · duración ("3:42").
- Pastillas de estado:
  - Estado de la letra (por ejemplo "Sincronizada", que puede llevar "· manual" si la pegué yo).
  - Estado de Spotify.
  - Una pastilla por cada playlist donde está la canción (enlaces).
- **A la derecha:**
  - Botón "Reproducir": empieza desde el inicio; solo aparece con Spotify conectado.
  - Botón "Abrir en Spotify" o "Buscar en Spotify".

**Si hubo error:** caja roja "Último error: …".

**Herramientas de la letra:**
- Botón "Editar letra", o "Pegar letra" si no hay.
- Botón "Buscar de nuevo en LRCLIB".
- Un mensaje de resultado al lado:
  - "Letra guardada."
  - "Letra actualizada desde LRCLIB."
  - "LRCLIB sigue sin encontrarla."
  - "LRCLIB no encontró nada; se conservó tu letra manual."

**Editor** (desplegable; se abre solo si la canción no tiene letra):
- Texto de ayuda: "Pega texto normal, o formato LRC (`[01:23.45] línea`) para guardarla con tiempos. Déjalo vacío y guarda para borrarla."
- Área de texto grande, en fuente mono.
- Botón "Guardar letra".

**Letra completa:** una tarjeta con la letra línea por línea.
- Si está sincronizada, cada línea lleva a la izquierda su tiempo como botón de reproducir.
- Al llegar desde un resultado, la línea correspondiente aparece resaltada en ámbar claro.
- Si la canción es instrumental: "Esta canción es instrumental."

### 5.3 Importar (`/importar`)

**Encabezado:**
- Título "Importar playlist".
- Explicación: "Sube un CSV de Spotify (exportado con Exportify) o un TXT exportado desde Apple Music. Las letras se descargan de LRCLIB en segundo plano."

**Tarjeta de formulario:**
- **Zona para arrastrar el archivo** (borde punteado; se pone verde al arrastrar encima):
  - Vacía: "Arrastra aquí tu archivo / o haz clic para elegirlo · .csv (Spotify) o .txt (Apple Music)".
  - Con archivo: el nombre del archivo, su tamaño en KB y "haz clic para cambiar".
- Campo "Nombre de la playlist". Se llena solo con el nombre del archivo; si el archivo trae el nombre de la playlist, se usa ese.
- Mensaje de error si el archivo no se puede leer. Por ejemplo: "No encontré una columna de título. Encabezados detectados: …".
- Botón "Importar" (pasa a "Importando…").

**Tarjeta de progreso** (aparece después de importar y se actualiza cada segundo):
- "**Banditapai**: 534 canciones leídas (CSV) · 521 con ISRC · 1 fila sin título ignorada".
- Barra de progreso verde.
- "**Letras: 87/120** — 74 sincronizadas, 9 sin tiempos, 4 instrumentales, 3 no encontradas, 1 con error".
- Línea opcional: "Spotify: X vinculadas, Y no encontradas".
- Al terminar, dos botones:
  - "Buscar en las letras" (primario, verde).
  - "Ver canciones".

### 5.4 Biblioteca (`/biblioteca`)

- **Aviso ámbar opcional** arriba, cuando Spotify pausó las búsquedas por cupo diario: "Spotify pausó las búsquedas … Mientras tanto puedes reproducir las canciones ya vinculadas…"
- **Sección "Playlists":**
  - Título y botón "+ Importar".
  - Una lista en una tarjeta; cada fila tiene:
    - El nombre de la playlist (enlace).
    - Debajo: "Spotify · 531 canciones · 513 sincronizadas · 8 sin tiempos · 4 instrumentales · 6 sin letra".
    - Otra línea: "Spotify: 120/531 vinculadas · 3 no están en Spotify".
    - A la derecha, acciones pequeñas:
      - "Vincular N con Spotify" (solo con sesión y si no hay bloqueo).
      - "Reintentar N sin letra".
      - "Borrar", que pide confirmación en el mismo lugar ("Sí, borrar" / "Cancelar").
  - Sin playlists: "Todavía no has importado ninguna playlist."
- **Sección "Canciones sin letra (N)":**
  - Lista de canciones con estado "No encontrada" o "Error".
  - Cada fila: "Título — Artista", la pastilla de estado y el enlace "Pegar letra".
  - Si no hay ninguna: "Todas las canciones tienen letra o son instrumentales."

### 5.5 Playlist (`/biblioteca/[id]`)

**Encabezado:**
- Enlace "Volver a la biblioteca".
- Nombre de la playlist.
- Resumen "531 canciones · 513 sincronizadas · … · 120 vinculadas a Spotify".
- **A la derecha:**
  - Botón "Buscar en esta playlist" (abre Buscar con esa playlist ya filtrada).
  - Las mismas acciones de la Biblioteca.

**Lista numerada de canciones.** Cada fila tiene:
- Número de posición.
- "Título — Artista" (enlace a la canción).
- Duración en mono.
- Pastilla de estado de la letra.
- Pastilla de Spotify.
- Botón pequeño de reproducir (solo el icono), que no aparece si la canción no está en Spotify.

### 5.6 Conectar Spotify (`/spotify`) — pantalla secundaria

Hoy casi no se ve, porque la app ya trae su configuración de Spotify. Solo aparece si falta.
- **Si ya está configurada:**
  - "App de Spotify configurada (Client ID 1a2b…9z8y, incluido en la app)."
  - Botón "Conectar Spotify", o "Conectado como Franco Aldrete".
- **Si falta configurarla:**
  - Pasos numerados para registrar la app en el panel de Spotify.
  - La dirección para copiar, con botón "Copiar".
  - Campo para pegar el Client ID y botón "Guardar".
  - Nota sobre agregar amigos en "User Management" (máximo 5).

## 6. Flujos clave

1. **Primera vez:**
   1. Entro a `/` y me redirige a Importar.
   2. Arrastro el archivo y le doy Importar.
   3. Veo el progreso de las letras.
   4. Al terminar, voy a "Buscar en las letras".
2. **Buscar y escuchar:**
   1. Escribo una palabra y elijo el modo.
   2. Reviso las tarjetas de resultados.
   3. Pico el tiempo "1:23" y la canción suena desde 1.5 s antes de esa línea, en el dispositivo elegido arriba.
   4. Si la canción estaba "Sin vincular", la etiqueta cambia sola a "Vinculada a Spotify".
3. **Letra faltante:**
   1. En Biblioteca veo "Canciones sin letra".
   2. Abro una canción y pico "Pegar letra".
   3. Pego la letra y guardo; desde ese momento ya aparece en las búsquedas.
4. **Conectar Spotify:**
   1. Pico "Conectar Spotify".
   2. Aparece la pantalla de permisos de Spotify y acepto.
   3. Regreso a la app conectado.

## 7. Datos disponibles para la interfaz

Lo que se puede mostrar sin cambios en el backend:
- **Playlist:**
  - Nombre, origen (Spotify / Apple Music / CSV) y fecha de importación.
  - Totales por estado de letra.
  - Cuántas canciones están vinculadas o no están en Spotify.
- **Canción:**
  - Título, artistas (todos y el principal), álbum, duración e ISRC.
  - Estado de la letra y su origen (LRCLIB o manual).
  - Estado de Spotify y en qué playlists está.
- **Línea de letra:** posición, tiempo en milisegundos (o ninguno) y texto.
- **Resultado de búsqueda:** canción, número de menciones y, por cada línea, el texto con la coincidencia marcada, el tiempo y las líneas anterior y siguiente.
- **Spotify:**
  - Si está conectado, nombre de la cuenta y si es Premium.
  - Dispositivos disponibles y si "Este navegador" está listo.
  - Qué suena (título, artista, en pausa o no) y hasta cuándo están pausadas las búsquedas.

No existen hoy, pero son fáciles de agregar si el diseño los necesita: portada del álbum (Spotify la da para las canciones vinculadas), fecha de la última búsqueda, historial de búsquedas, estadísticas generales (página "Estado").

## 8. Lo que no me gusta hoy / qué buscar con el rediseño

- **Se ve genérico**, como plantilla; no tiene identidad de app de música.
- **El encabezado mezcla demasiado** a la derecha: Spotify, dispositivo, cuenta y salir.
- **Los resultados se ven densos:** muchas pastillas y textos grises compitiendo; la línea encontrada y el botón de reproducir deberían ser lo protagonista.
- **No hay un reproductor visible:** solo la mini-pastilla del encabezado. Podría haber una barra de reproducción fija abajo, como en Spotify.
- **Los estados (de la letra y de Spotify) usan muchos colores distintos**; podría simplificarse.
- **Las pantallas de Biblioteca y Playlist son listas de texto planas.**

## 9. Fase 2 (futura, para reservar espacio en el diseño)

**Búsqueda por significado:** escribir algo como "una canción sobre estar triste porque se me descompuso el carro" y que encuentre los fragmentos de letra (de unas 4 líneas) más parecidos en sentido, aunque no compartan palabras.

Lo que esto necesita en el diseño:
- Una forma de elegir entre la búsqueda "por palabras" y la búsqueda "por significado".
- Resultados por fragmento (no por línea), con un porcentaje de parecido.
- Opcionalmente, una explicación generada de por qué encaja cada fragmento.

## 10. Qué necesito de vuelta del diseño

Para poder implementarlo después:
1. **Pantallas a diseñar:** Buscar (con resultados, sin resultados, sin Spotify y con Spotify), Canción (con letra sincronizada, sin letra y editor abierto), Importar (vacío, con archivo y en progreso), Biblioteca, Playlist, y el encabezado y reproductor en sus estados de Spotify. Cada una en escritorio y en celular.
2. **Tokens:** colores (y modo oscuro, si se propone), tipografías, tamaños, radios, sombras y espacios.
3. **Componentes con sus estados:**
   - Botón de reproducir: normal, cargando, deshabilitado.
   - Pastillas de estado.
   - Tarjeta de resultado.
   - Fila de canción.
   - Toast.
   - Selector de dispositivo.
   - Reproductor.
4. **Iconos SVG** que se necesiten (sin emojis).
