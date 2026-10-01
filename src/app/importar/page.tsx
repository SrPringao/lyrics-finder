import { ImportForm } from "@/components/ImportForm";

export default function ImportarPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.03em]">Importar playlist</h1>
        <p className="mt-1 text-sm text-secondary">
          Sube un CSV de Spotify (exportado con Exportify o TuneMyMusic) o un TXT exportado desde Apple Music. Las letras se
          descargan de LRCLIB en segundo plano.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
