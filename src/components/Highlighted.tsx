import { splitHighlighted } from "@/lib/search/fts";

export function Highlighted({ text }: { text: string }) {
  return (
    <>
      {splitHighlighted(text).map((seg, i) => (seg.mark ? <mark key={i}>{seg.text}</mark> : <span key={i}>{seg.text}</span>))}
    </>
  );
}
