import type { LyricLine } from "@/lib/parsers/lrc";

export interface LyricChunk {
  chunkIndex: number;
  startLine: number;
  endLine: number; // inclusiva
  startMs: number | null;
  text: string;
}

/**
 * Parte una letra en ventanas de `size` líneas que avanzan de `step` en `step`
 * (con traslape, para que una idea partida entre dos ventanas no se pierda).
 * Fase 2: cada fragmento se convertirá en un embedding (ver README).
 */
export function chunkLines(lines: LyricLine[], size = 4, step = 2): LyricChunk[] {
  if (lines.length === 0) return [];
  const chunks: LyricChunk[] = [];
  for (let start = 0; ; start += step) {
    const end = Math.min(start + size, lines.length) - 1;
    chunks.push({
      chunkIndex: chunks.length,
      startLine: start,
      endLine: end,
      startMs: lines[start].timeMs,
      text: lines
        .slice(start, end + 1)
        .map((l) => l.text)
        .join("\n"),
    });
    if (end >= lines.length - 1) break;
  }
  return chunks;
}
