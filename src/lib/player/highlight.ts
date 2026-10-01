/**
 * Resalta en el cliente los términos de la búsqueda dentro de una línea de letra
 * (el panel "Ahora suena" no pasa por FTS5). Ignora mayúsculas y acentos como la búsqueda.
 */

export type HighlightMode = "palabra" | "contiene";

export interface Segment {
  text: string;
  hit: boolean;
}

interface Term {
  text: string;
  prefix: boolean;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function queryTerms(query: string, mode: HighlightMode): Term[] {
  const terms: Term[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    for (const word of raw.split(/\s+/)) {
      const prefix = mode === "palabra" && word.endsWith("*");
      const clean = fold(word.replace(/["*]/g, "")).replace(/[^\p{L}\p{N}]/gu, "");
      if (!clean) continue;
      if (mode === "contiene" && [...clean].length < 3) continue;
      terms.push({ text: clean, prefix });
    }
  }
  return terms;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

export function highlightTerms(text: string, query: string, mode: HighlightMode): Segment[] {
  const terms = queryTerms(query, mode);
  if (terms.length === 0 || !text) return [{ text, hit: false }];

  // Texto "doblado" carácter por carácter, con el índice original de cada uno.
  let folded = "";
  const map: number[] = [];
  [...text].forEach((ch, idx) => {
    const f = fold(ch);
    for (const c of f) {
      folded += c;
      map.push(idx);
    }
  });
  const chars = [...text];
  const hit = new Array<boolean>(chars.length).fill(false);

  for (const term of terms) {
    let from = 0;
    while (true) {
      const at = folded.indexOf(term.text, from);
      if (at === -1) break;
      const end = at + term.text.length;
      const ok =
        mode === "contiene" || (!isWordChar(folded[at - 1]) && (term.prefix || !isWordChar(folded[end])));
      if (ok) for (let k = at; k < end; k++) hit[map[k]] = true;
      from = at + 1;
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
