import { describe, expect, it } from "vitest";
import { formatTime, looksLikeLrc, lrcToPlain, parseLrc, parsePlain } from "@/lib/parsers/lrc";

// Letra inventada para pruebas.
const LRC = `[ar:Banda de Prueba]
[ti:Canción de Prueba]
[length: 03:12]
[by:alguien]
[00:05.20] Salí temprano rumbo a Madrid
[00:09.75]
[00:10.5] La radio sonaba sin parar
[01:02.123][02:30.00] Coro que se repite
[00:15] Línea sin   fracción
[00:20.00] <00:20.00>Palabra <00:20.50>por <00:21.00>palabra
texto sin marca de tiempo`;

describe("parseLrc", () => {
  const lines = parseLrc(LRC);

  it("ignora metadatos, líneas vacías y texto sin marca", () => {
    expect(lines.map((l) => l.text)).not.toContain("alguien");
    expect(lines.some((l) => l.text === "")).toBe(false);
    expect(lines.some((l) => l.text.includes("sin marca"))).toBe(false);
  });

  it("convierte las marcas a milisegundos y ordena", () => {
    expect(lines).toEqual([
      { timeMs: 5200, text: "Salí temprano rumbo a Madrid" },
      { timeMs: 10500, text: "La radio sonaba sin parar" },
      { timeMs: 15000, text: "Línea sin fracción" },
      { timeMs: 20000, text: "Palabra por palabra" },
      { timeMs: 62123, text: "Coro que se repite" },
      { timeMs: 150000, text: "Coro que se repite" },
    ]);
  });

  it("aplica [offset:]", () => {
    expect(parseLrc("[offset:+500]\n[00:01.00] hola")[0].timeMs).toBe(500);
    expect(parseLrc("[offset:-250]\n[00:01.00] hola")[0].timeMs).toBe(1250);
  });

  it("lee CRLF", () => {
    expect(parseLrc("[00:01.00] a\r\n[00:02.00] b")).toHaveLength(2);
  });
});

describe("utilidades LRC", () => {
  it("parsePlain separa líneas no vacías sin tiempo", () => {
    expect(parsePlain("uno\n\n  dos  \r\ntres")).toEqual([
      { timeMs: null, text: "uno" },
      { timeMs: null, text: "dos" },
      { timeMs: null, text: "tres" },
    ]);
  });

  it("looksLikeLrc", () => {
    expect(looksLikeLrc(LRC)).toBe(true);
    expect(looksLikeLrc("una letra\nnormal")).toBe(false);
  });

  it("lrcToPlain", () => {
    expect(lrcToPlain("[00:01.00] a\n[00:02.00] b")).toBe("a\nb");
  });

  it("formatTime", () => {
    expect(formatTime(62123)).toBe("1:02");
    expect(formatTime(5000)).toBe("0:05");
    expect(formatTime(null)).toBe("");
  });
});
