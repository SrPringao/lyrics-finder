import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";

const circle = "flex h-9 w-9 items-center justify-center rounded-full bg-pill";

/** Paginación centrada: botones circulares de 36 px y "1 de 2" en medio. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Paginación" className="mt-auto flex items-center justify-center gap-4 pt-[14px] text-[13px] text-secondary">
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="Anterior" className={`${circle} text-ink`}>
          <ChevronLeftIcon />
        </Link>
      ) : (
        <button type="button" disabled aria-label="Anterior" className={`${circle} cursor-default text-disabled`}>
          <ChevronLeftIcon />
        </button>
      )}
      <span>
        <span className="font-semibold text-ink">{page}</span> de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} aria-label="Siguiente" className={`${circle} text-ink`}>
          <ChevronRightIcon />
        </Link>
      ) : (
        <button type="button" disabled aria-label="Siguiente" className={`${circle} cursor-default text-disabled`}>
          <ChevronRightIcon />
        </button>
      )}
    </nav>
  );
}

/** Construye la URL de una página conservando los demás parámetros. */
export function pageHref(base: string, params: Record<string, string | number | null | undefined>, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
  if (page > 1) qs.set("p", String(page));
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
