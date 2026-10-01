"use client";

import { useEffect, useRef, useState } from "react";
import { DeviceIcon } from "@/components/Icons";
import { BROWSER_DEVICE, useSpotify } from "@/components/spotify/SpotifyProvider";
import { initials } from "@/lib/player/timing";

/** Cierra un menú al hacer clic fuera o con Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const menuClass =
  "absolute z-30 mt-2 min-w-56 overflow-hidden rounded-[12px] bg-white py-1.5 text-[13px] text-ink shadow-[0_14px_30px_rgba(0,0,0,0.16)] ring-1 ring-hairline";

export function DeviceMenu() {
  const { browserDeviceId, sdkError, selectedDevice, setSelectedDevice, devices, loadDevices } = useSpotify();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  const others = devices.filter((d) => d.id && d.id !== browserDeviceId && !d.is_restricted);
  const selected = others.find((d) => d.id === selectedDevice);
  const label = selected ? selected.name : "Este navegador";
  const kind = (t: string) => (t === "Smartphone" ? "celular" : t === "Computer" ? "computadora" : t.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!open) loadDevices();
          setOpen(!open);
        }}
        className="flex max-w-60 items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs text-tint-ink"
      >
        <DeviceIcon />
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label="Dónde se reproduce" className={`${menuClass} left-0`}>
          <li>
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              onClick={() => {
                setSelectedDevice(BROWSER_DEVICE);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-pill"
            >
              <span>
                Este navegador
                <span className="block text-xs text-secondary">
                  {browserDeviceId ? "Listo" : sdkError ? "No disponible" : "Conectando…"}
                </span>
              </span>
              {!selected && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
            </button>
          </li>
          {others.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected?.id === d.id}
                onClick={() => {
                  setSelectedDevice(d.id!);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left hover:bg-pill"
              >
                <span>
                  {d.name}
                  <span className="block text-xs text-secondary">{kind(d.type)}</span>
                </span>
                {selected?.id === d.id && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
              </button>
            </li>
          ))}
          {others.length === 0 && (
            <li className="px-3.5 py-2 text-xs text-secondary">Abre Spotify en tu celular o computadora para verlos aquí.</li>
          )}
        </ul>
      )}
    </div>
  );
}

export function AccountMenu() {
  const { status, logout } = useSpotify();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const name = status?.displayName ?? "Tu cuenta";
  const premium = status?.product === "premium";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Cuenta: ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="h-[30px] w-[30px] rounded-full bg-white/70 text-[11px] font-semibold text-tint-ink"
      >
        {initials(status?.displayName)}
      </button>
      {open && (
        <div role="menu" className={`${menuClass} right-0`}>
          <div className="px-3.5 py-2">
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-secondary">{premium ? "Spotify Premium" : "Cuenta sin Premium: no se puede reproducir"}</div>
          </div>
          <div className="my-1 h-px bg-hairline" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="w-full px-3.5 py-2 text-left hover:bg-pill"
          >
            Salir
          </button>
        </div>
      )}
    </div>
  );
}
