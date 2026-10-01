/**
 * "Tinte de portada": a partir del color dominante de la portada se deriva la paleta del panel.
 * Las luminosidades y saturaciones salen de los tokens por defecto (#E6ECE2 / #1E2A1B / #5A6A55 /
 * #2E6B3C), así cada portada da un panel igual de claro y legible, solo cambia el tono.
 */

export type RGB = [number, number, number];

export interface TintPalette {
  tint: string; // fondo del panel
  ink: string; // texto principal
  secondary: string; // texto secundario
  accent: string; // palabra buscada, tiempos
  mark: string; // marcas de menciones en la barra
  chipBorder: string; // borde de chips blancos
}

export const DEFAULT_TINT: TintPalette = {
  tint: "#E6ECE2",
  ink: "#1E2A1B",
  secondary: "#5A6A55",
  accent: "#2E6B3C",
  mark: "#5E8E5A",
  chipBorder: "#DCE3D8",
};

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Oscurece el texto (mismo tono) hasta llegar al contraste pedido sobre el fondo. */
function ensureContrast(h: number, s: number, l: number, bg: RGB, min = 4.5): RGB {
  let light = l;
  let rgb = hslToRgb(h, s, light);
  while (contrastRatio(rgb, bg) < min && light > 0) {
    light = Math.max(0, light - 0.02);
    rgb = hslToRgb(h, s, light);
  }
  return rgb;
}

const BASE = {
  tint: rgbToHsl(hexToRgb(DEFAULT_TINT.tint)),
  ink: rgbToHsl(hexToRgb(DEFAULT_TINT.ink)),
  secondary: rgbToHsl(hexToRgb(DEFAULT_TINT.secondary)),
  accent: rgbToHsl(hexToRgb(DEFAULT_TINT.accent)),
  mark: rgbToHsl(hexToRgb(DEFAULT_TINT.mark)),
  chipBorder: rgbToHsl(hexToRgb(DEFAULT_TINT.chipBorder)),
};

/**
 * Paleta para un color dominante. Portadas casi grises (sin tono claro) usan la paleta por
 * defecto, para no inventar un tono que la portada no tiene.
 */
export function deriveTint(dominant: RGB | null): TintPalette {
  if (!dominant) return DEFAULT_TINT;
  const [h, s] = rgbToHsl(dominant);
  if (s < 0.08) return DEFAULT_TINT;
  const bg = hslToRgb(h, BASE.tint[1], BASE.tint[2]);
  const at = (base: [number, number, number]) => ensureContrast(h, base[1], base[2], bg);
  return {
    tint: rgbToHex(bg),
    ink: rgbToHex(at(BASE.ink)),
    secondary: rgbToHex(at(BASE.secondary)),
    accent: rgbToHex(at(BASE.accent)),
    // Las marcas no son texto: basta con 3:1 frente a la pista.
    mark: rgbToHex(ensureContrast(h, BASE.mark[1], BASE.mark[2], bg, 3)),
    chipBorder: rgbToHex(hslToRgb(h, BASE.chipBorder[1], BASE.chipBorder[2])),
  };
}

/**
 * Color dominante de un conjunto de píxeles RGBA: promedio ponderado por saturación, para que
 * el tono de la portada pese más que los blancos, negros y grises.
 */
export function dominantFromPixels(data: Uint8ClampedArray | number[]): RGB | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const px: RGB = [data[i], data[i + 1], data[i + 2]];
    const [, s, l] = rgbToHsl(px);
    const weight = s * (1 - Math.abs(2 * l - 1)) + 0.02;
    r += px[0] * weight;
    g += px[1] * weight;
    b += px[2] * weight;
    w += weight;
  }
  if (w === 0) return null;
  return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
}
