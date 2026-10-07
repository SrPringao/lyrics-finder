/**
 * Resalta en el cliente la búsqueda dentro de una línea de letra (el panel "Ahora suena" no pasa
 * por FTS5). Sigue las mismas reglas que la búsqueda: varias palabras seguidas son una frase,
 * cada texto entre comillas es otra, e ignora mayúsculas y acentos.
 */

export type HighlightMode = "palabra" | "contiene";

export interface Segment {
  text: string;
  hit: boolean;
}

interface Phrase {
  words: string[];
  prefix: boolean;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const cleanWord = (w: string) => fold(w.replace(/["*]/g, "")).replace(/[^\p{L}\p{N}]/gu, "");

export function queryPhrases(query: string, mode: HighlightMode): Phrase[] {
  const phrases: Phrase[] = [];
  const push = (raw: string[], prefix: boolean) => {
    const words = raw.map(cleanWord).filter(Boolean);
    if (words.length === 0) return;
    if (mode === "contiene" && [...words.join(" ")].length < 3) return;
    phrases.push({ words, prefix: prefix && mode === "palabra" });
  };
  let run: string[] = [];
  const flush = () => {
    if (run.length) push(run, /\*$/.test(run[run.length - 1]));
    run = [];
  };
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    if (m[1] !== undefined) {
      flush();
      push(m[1].trim().split(/\s+/), false);
    } else run.push(m[2]);
  }
  flush();
  return phrases;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function highlightTerms(text: string, query: string, mode: HighlightMode): Segment[] {
  const phrases = queryPhrases(query, mode);
  if (phrases.length === 0 || !text) return [{ text, hit: false }];

  // Texto "doblado" carácter por carácter, con el índice original de cada uno.
  let folded = "";
  const map: number[] = [];
  const chars = [...text];
  chars.forEach((ch, idx) => {
    for (const c of fold(ch)) {
      folded += c;
      map.push(idx);
    }
  });
  const hit = new Array<boolean>(chars.length).fill(false);

  for (const p of phrases) {
    // Entre palabras de la frase puede haber espacios o puntuación ("me, cocina").
    const body = p.words.map(escape).join("[^\\p{L}\\p{N}]+");
    const source =
      mode === "contiene" ? body : `(?<![\\p{L}\\p{N}])${body}${p.prefix ? "" : "(?![\\p{L}\\p{N}])"}`;
    for (const match of folded.matchAll(new RegExp(source, "gu"))) {
      const start = match.index ?? 0;
      for (let k = start; k < start + match[0].length; k++) hit[map[k]] = true;
    }
  }

  const out: Segment[] = [];
  chars.forEach((ch, i) => {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += ch;
    else out.push({ text: ch, hit: hit[i] });
  });
  return out;
}
