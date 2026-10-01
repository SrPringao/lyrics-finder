import { describe, expect, it, vi } from "vitest";
import {
  cleanTitle,
  fetchLyrics,
  pickBestSearchResult,
  type LrclibRecord,
} from "@/lib/lrclib/client";
import { Limiter } from "@/lib/lrclib/limiter";

const rec = (over: Partial<LrclibRecord>): LrclibRecord => ({
  id: 1,
  trackName: "Canción",
  artistName: "Artista",
  albumName: "Álbum",
  duration: 200,
  instrumental: false,
  plainLyrics: "uno\ndos",
  syncedLyrics: "[00:01.00] uno\n[00:02.00] dos",
  ...over,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** fetch falso que responde según la ruta y registra las URLs pedidas. */
function fakeFetch(routes: (url: URL) => Response) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    return routes(url);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const noSleep = { sleep: async () => {} };

describe("cleanTitle", () => {
  it.each([
    ["Hey Jude - Remastered 2015", "Hey Jude"],
    ["Something - 2009 Remaster", "Something"],
    ["Canción (feat. Otro Artista)", "Canción"],
    ["Canción [feat. Otro]", "Canción"],
    ["Canción feat. Otro", "Canción"],
    ["Song - Live at Wembley", "Song"],
    ["Song - Radio Edit", "Song"],
    ["Song (with Someone)", "Song"],
    ["Let It Be - Single Version", "Let It Be"],
    ["Canción - En Vivo", "Canción"],
    ["Pieza (From \"Película\")", "Pieza"],
  ])("%s → %s", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });

  it("no toca títulos normales con guion o paréntesis legítimos", () => {
    expect(cleanTitle("Sweet Child O' Mine")).toBe("Sweet Child O' Mine");
    expect(cleanTitle("Ob-La-Di, Ob-La-Da")).toBe("Ob-La-Di, Ob-La-Da");
    expect(cleanTitle("(I Can't Get No) Satisfaction")).toBe("(I Can't Get No) Satisfaction");
    expect(cleanTitle("Rock - Paper - Scissors")).toBe("Rock - Paper - Scissors");
  });
});

describe("pickBestSearchResult", () => {
  it("prefiere sincronizada dentro de ±3 s y luego la duración más cercana", () => {
    const best = pickBestSearchResult(
      [
        rec({ id: 1, duration: 1 }), // basura
        rec({ id: 2, duration: 202, syncedLyrics: null }),
        rec({ id: 3, duration: 203 }),
        rec({ id: 4, duration: 201 }),
        rec({ id: 5, duration: 260 }),
      ],
      { title: "Canción", durationSec: 200 },
    );
    expect(best?.id).toBe(4);
  });

  it("acepta sin tiempos si es lo único dentro de la tolerancia", () => {
    const best = pickBestSearchResult([rec({ id: 2, duration: 199, syncedLyrics: null }), rec({ id: 9, duration: 230 })], {
      title: "Canción",
      durationSec: 200,
    });
    expect(best?.id).toBe(2);
  });

  it("sin duración conocida exige que el título coincida", () => {
    const results = [rec({ id: 1, trackName: "Otra cosa" }), rec({ id: 2, trackName: "cancion" })];
    expect(pickBestSearchResult(results, { title: "Canción" })?.id).toBe(2);
  });

  it("ignora resultados sin letra", () => {
    expect(pickBestSearchResult([rec({ plainLyrics: null, syncedLyrics: null })], { title: "Canción", durationSec: 200 })).toBeNull();
  });
});

describe("fetchLyrics", () => {
  const q = { title: "Canción - Remastered 2011", artist: "Artista", album: "Álbum", durationSec: 200 };

  it("usa /get con título limpio y manda User-Agent", async () => {
    const { fn, calls } = fakeFetch((u) => (u.pathname === "/api/get" ? json(rec({ id: 42 })) : json([])));
    const r = await fetchLyrics(q, { fetchImpl: fn, ...noSleep });
    expect(r).toMatchObject({ status: "synced", lrclibId: 42, matchedVia: "get" });
    expect(calls[0].searchParams.get("track_name")).toBe("Canción");
    expect(calls[0].searchParams.get("duration")).toBe("200");
    const init = (fn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toMatch(/LetrasPlaylist/);
  });

  it("si /get da 404 con título limpio, prueba el original y luego /search", async () => {
    const { fn, calls } = fakeFetch((u) => {
      if (u.pathname === "/api/get") return json({ name: "TrackNotFound" }, 404);
      return json([rec({ id: 7, duration: 202 })]);
    });
    const r = await fetchLyrics(q, { fetchImpl: fn, ...noSleep });
    expect(r).toMatchObject({ status: "synced", lrclibId: 7, matchedVia: "search" });
    expect(calls.map((c) => `${c.pathname}:${c.searchParams.get("track_name")}`)).toEqual([
      "/api/get:Canción",
      "/api/get:Canción - Remastered 2011",
      "/api/search:Canción",
    ]);
  });

  it("detecta instrumentales", async () => {
    const { fn } = fakeFetch(() => json(rec({ instrumental: true, plainLyrics: null, syncedLyrics: null })));
    expect((await fetchLyrics(q, { fetchImpl: fn })).status).toBe("instrumental");
  });

  it("si /get solo trae texto plano, busca una versión sincronizada", async () => {
    const { fn } = fakeFetch((u) =>
      u.pathname === "/api/get" ? json(rec({ id: 1, syncedLyrics: null })) : json([rec({ id: 2, duration: 200 })]),
    );
    expect(await fetchLyrics(q, { fetchImpl: fn })).toMatchObject({ status: "synced", lrclibId: 2 });
  });

  it("se queda con la versión sin tiempos si no hay otra", async () => {
    const { fn } = fakeFetch((u) => (u.pathname === "/api/get" ? json(rec({ id: 1, syncedLyrics: null })) : json([])));
    expect(await fetchLyrics(q, { fetchImpl: fn })).toMatchObject({ status: "plain", lrclibId: 1, plainLyrics: "uno\ndos" });
  });

  it("not_found cuando nada coincide", async () => {
    const { fn } = fakeFetch((u) => (u.pathname === "/api/get" ? json({}, 404) : json([rec({ duration: 999 })])));
    expect((await fetchLyrics(q, { fetchImpl: fn })).status).toBe("not_found");
  });

  it("reintenta 429/5xx con backoff y respeta Retry-After", async () => {
    let n = 0;
    const sleeps: number[] = [];
    const { fn } = fakeFetch(() => {
      n++;
      if (n === 1) return json({}, 429, { "retry-after": "2" });
      if (n === 2) return json({}, 503);
      return json(rec({ id: 5 }));
    });
    const r = await fetchLyrics(q, { fetchImpl: fn, baseDelayMs: 100, sleep: async (ms) => void sleeps.push(ms) });
    expect(r.lrclibId).toBe(5);
    expect(sleeps[0]).toBe(2000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(200);
  });

  it("lanza error tras agotar reintentos (para marcar la canción como error, no como no encontrada)", async () => {
    const { fn } = fakeFetch(() => json({}, 500));
    await expect(fetchLyrics(q, { fetchImpl: fn, maxRetries: 2, ...noSleep })).rejects.toThrow(/500/);
  });
});

describe("Limiter", () => {
  it("nunca ejecuta más de N tareas a la vez", async () => {
    const lim = new Limiter(3);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        lim.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    expect(peak).toBe(3);
  });
});
