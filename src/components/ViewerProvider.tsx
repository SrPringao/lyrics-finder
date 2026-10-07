"use client";

import { createContext, useContext } from "react";

const GuestContext = createContext(false);

/** Indica a los componentes de cliente si quien ve la app es invitado (solo buscar y reproducir). */
export function ViewerProvider({ guest, children }: { guest: boolean; children: React.ReactNode }) {
  return <GuestContext.Provider value={guest}>{children}</GuestContext.Provider>;
}

export function useIsGuest(): boolean {
  return useContext(GuestContext);
}
