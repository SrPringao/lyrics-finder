"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Oculta una canción que nunca tendrá letra (o la vuelve a mostrar). */
export function IgnoreLyricsButton({ trackId, ignored, variant = "text" }: { trackId: number; ignored: boolean; variant?: "text" | "pill" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/ignore`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ignored: !ignored }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const label = ignored ? "Mostrar de nuevo" : variant === "pill" ? "No tiene letra: ocultar" : "Ocultar";
  const cls =
    variant === "pill"
      ? "rounded-full bg-pill px-[13px] py-1.5 text-[13px] text-ink hover:bg-hairline disabled:opacity-40"
      : "border-0 bg-transparent p-0 text-[13px] font-semibold text-secondary hover:text-ink hover:underline disabled:opacity-40";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={ignored ? "Volverá a aparecer en “Canciones sin letra”" : "Ya no aparecerá en “Canciones sin letra” ni se volverá a buscar"}
      className={cls}
    >
      {busy ? "…" : label}
    </button>
  );
}
