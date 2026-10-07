import { describe, expect, it } from "vitest";
import { highlightTerms } from "@/lib/player/highlight";
import { contrastRatio, DEFAULT_TINT, deriveTint, dominantFromPixels, hexToRgb, rgbToHsl } from "@/lib/player/tint";
import { currentLineIndex, formatClock, initials, nextMention, prevMention } from "@/lib/player/timing";

describe("tinte de portada", () => {
  it("sin color o casi gris usa la paleta por defecto", () => {
    expect(deriveTint(null)).toEqual(DEFAULT_TINT);
    expect(deriveTint([128, 128, 130])).toEqual(DEFAULT_TINT);
  });

  it("conserva la luminosidad del fondo por defecto y el tono de la portada", () => {
    for (const color of [[200, 40, 60], [30, 90, 200], [240, 200, 20], [120, 40, 160]] as [number, number, number][]) {
      const p = deriveTint(color);
      const [hBg, , lBg] = rgbToHsl(hexToRgb(p.tint));
      const [hIn] = rgbToHsl(color);
      expect(Math.abs(lBg - rgbToHsl(hexToRgb(DEFAULT_TINT.tint))[2])).toBeLessThan(0.01);
      expect(Math.min(Math.abs(hBg - hIn), 360 - Math.abs(hBg - hIn))).toBeLessThan(4);
      // Texto, secundario y acento legibles (4.5:1) sobre el fondo.
      for (const fg of [p.ink, p.secondary, p.accent]) expect(contrastRatio(hexToRgb(fg), hexToRgb(p.tint))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el color dominante pesa más que blancos y negros", () => {
    const px = [255, 255, 255, 255, 0, 0, 0, 255, 200, 30, 30, 255];
    const [r, g, b] = dominantFromPixels(px)!;
    expect(r).toBeGreaterThan(g + 80);
    expect(r).toBeGreaterThan(b + 80);
  });
});

describe("resaltado en el panel", () => {
  const hits = (text: string, q: string, mode: "palabra" | "contiene") =>
    highlightTerms(text, q, mode)
      .filter((s) => s.hit)
      .map((s) => s.text);

  it("palabra completa, sin importar acentos ni mayúsculas", () => {
    expect(hits("Tomé el tren hacia MADRID", "madrid", "palabra")).toEqual(["MADRID"]);
    expect(hits("Madridista de corazón", "madrid", "palabra")).toEqual([]);
    expect(hits("Una canción triste", "cancion", "palabra")).toEqual(["canción"]);
    expect(hits("Madridista de corazón", "madrid*", "palabra")).toEqual(["Madrid"]);
  });

  it("contiene el texto, y frases entre comillas", () => {
    expect(hits("Madridista de corazón", "madri", "contiene")).toEqual(["Madri"]);
    expect(hits("tren nocturno a Madrid", '"tren nocturno"', "palabra")).toEqual(["tren nocturno"]);
    // Sin comillas también es frase: no se resalta cada palabra suelta.
    expect(hits("me grita desde la cocina", "me cocina", "palabra")).toEqual([]);
    expect(hits("Y ahora me, cocina en casa", "me cocina", "palabra")).toEqual(["me, cocina"]);
    expect(hits("me grita desde la cocina", '"me" "cocina"', "palabra")).toEqual(["me", "cocina"]);
    expect(hits("ma ma", "ma", "contiene")).toEqual([]);
  });

  it("reconstruye el texto original sin perder caracteres", () => {
    const text = "Ñandú, ¿dónde está Madrid?";
    expect(highlightTerms(text, "madrid", "palabra").map((s) => s.text).join("")).toBe(text);
  });
});

describe("tiempos", () => {
  const lines = [{ t: 1000 }, { t: null }, { t: 5000 }, { t: 9000 }];
  it("línea actual", () => {
    expect(currentLineIndex(lines, 0)).toBe(0);
    expect(currentLineIndex(lines, 5200)).toBe(2);
    expect(currentLineIndex(lines, 99999)).toBe(3);
  });

  it("menciones siguiente y anterior (con el margen de 1.5 s)", () => {
    const m = [20000, 60000, 90000];
    expect(nextMention(m, 18500)).toBe(60000); // recién saltamos a la de 20 s
    expect(nextMention(m, 95000)).toBeNull();
    expect(prevMention(m, 58500)).toBe(20000); // recién saltamos a la de 60 s
    expect(prevMention(m, 70000)).toBe(60000);
    expect(prevMention(m, 10000)).toBeNull();
  });

  it("formatos", () => {
    expect(formatClock(188000)).toBe("3:08");
    expect(initials("Franco Aldrete")).toBe("FA");
    expect(initials("")).toBe("?");
  });
});
