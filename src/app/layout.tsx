import type { Metadata } from "next";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { NowPlayingPanel } from "@/components/player/NowPlayingPanel";
import { Toast } from "@/components/player/Toast";
import { SiteHeader } from "@/components/SiteHeader";
import { SpotifyProvider } from "@/components/spotify/SpotifyProvider";
import { ViewerProvider } from "@/components/ViewerProvider";
import { appPassword } from "@/lib/auth/session";
import { isGuest } from "@/lib/auth/viewer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letras de mis playlists",
  description: "Busca palabras y frases dentro de las letras de tus playlists",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const guest = await isGuest();
  return (
    <html lang="es" className="h-full antialiased">
      {/* Extensiones como ColorZilla agregan atributos al <body> antes de hidratar (cz-shortcut-listen). */}
      <body className="h-full bg-white text-ink" suppressHydrationWarning>
        <ViewerProvider guest={guest} canLogout={!!appPassword()}>
        <SpotifyProvider>
          <div className="lg:grid lg:h-dvh lg:grid-cols-[minmax(0,1fr)_480px] lg:overflow-hidden">
            {/* Contenido: ocupa toda la altura; la lista crece y la paginación queda abajo. */}
            <div className="flex min-h-dvh min-w-0 flex-col px-4 pb-[96px] lg:h-dvh lg:min-h-0 lg:overflow-y-auto lg:px-[44px] lg:pb-6">
              <SiteHeader />
              <main className="flex flex-1 flex-col">{children}</main>
            </div>
            <aside aria-label="Ahora suena" className="hidden lg:block lg:h-dvh lg:min-h-0">
              <NowPlayingPanel />
            </aside>
          </div>
          <MiniPlayer />
          <Toast />
        </SpotifyProvider>
        </ViewerProvider>
      </body>
    </html>
  );
}
