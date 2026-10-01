import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SpotifyBar } from "@/components/spotify/SpotifyBar";
import { SpotifyProvider } from "@/components/spotify/SpotifyProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Letras de mis playlists",
  description: "Busca palabras y frases dentro de las letras de tus playlists",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <SpotifyProvider>
        <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
          <nav className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Letras
            </Link>
            <div className="flex gap-4 text-sm text-stone-600">
              <Link href="/buscar" className="hover:text-stone-900">Buscar</Link>
              <Link href="/importar" className="hover:text-stone-900">Importar</Link>
              <Link href="/biblioteca" className="hover:text-stone-900">Biblioteca</Link>
            </div>
            <div className="ml-auto">
              <SpotifyBar />
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
        </SpotifyProvider>
      </body>
    </html>
  );
}
