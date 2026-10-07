"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useViewer } from "@/components/ViewerProvider";

const LINKS = [
  { href: "/buscar", label: "Buscar" },
  { href: "/importar", label: "Importar", ownerOnly: true },
  { href: "/biblioteca", label: "Biblioteca" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { guest, canLogout } = useViewer();
  return (
    <header className="flex h-[72px] shrink-0 items-center gap-8">
      <Link href="/buscar" className="text-[22px] font-bold tracking-[-0.03em] text-ink">
        Letras
      </Link>
      <nav className="flex gap-[22px] text-sm">
        {LINKS.filter((l) => !(guest && l.ownerOnly)).map((l) => {
          const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={active ? "font-semibold text-ink" : "text-secondary hover:text-ink"}>
              {l.label}
            </Link>
          );
        })}
      </nav>
      {canLogout && (
        <form method="post" action="/acceso/salir" className="ml-auto">
          <button type="submit" className="text-sm text-secondary hover:text-ink">
            Salir{guest && " (invitado)"}
          </button>
        </form>
      )}
    </header>
  );
}
