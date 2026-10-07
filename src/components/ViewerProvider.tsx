"use client";

import { createContext, useContext } from "react";

interface Viewer {
  /** Invitado: solo buscar y reproducir. */
  guest: boolean;
  /** Hay contraseña configurada, así que tiene sentido "Salir". */
  canLogout: boolean;
}

const ViewerContext = createContext<Viewer>({ guest: false, canLogout: false });

export function ViewerProvider({ children, ...viewer }: Viewer & { children: React.ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}

export function useIsGuest(): boolean {
  return useContext(ViewerContext).guest;
}
