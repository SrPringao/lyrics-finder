import { connection } from "next/server";
import { ImportForm } from "@/components/ImportForm";
import { SpotifyPlaylists } from "@/components/import/SpotifyPlaylists";
import { getDb } from "@/lib/db";
import { listPlaylists } from "@/lib/db/repo";

export default async function ImportarPage() {
  await connection();
  const appPlaylists = listPlaylists(getDb()).map((p) => ({ id: p.id, name: p.name }));
  return (
    <div className="flex flex-col gap-10 pb-10">
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.03em]">Importar playlist</h1>
        <p className="mt-1 text-sm text-secondary">
          Elige una de tus playlists de Spotify o sube un archivo exportado. Las letras se descargan de LRCLIB en segundo
          plano.
        </p>
      </div>
      <SpotifyPlaylists appPlaylists={appPlaylists} />
      <section className="flex flex-col gap-4">
        <h2 className="border-b border-hairline pb-3 text-[17px] font-semibold">Desde un archivo</h2>
        <p className="text-[13px] text-secondary">CSV de TuneMyMusic, Exportify o de esta app, o TXT exportado desde Apple Music.</p>
        <ImportForm />
      </section>
    </div>
  );
}
