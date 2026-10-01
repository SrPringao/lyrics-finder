import { ImportForm } from "@/components/ImportForm";

export default function ImportarPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importar playlist</h1>
        <p className="mt-1 text-sm text-stone-600">
          Sube un CSV de Spotify (exportado con Exportify) o un TXT exportado desde Apple Music. Las letras se descargan
          de LRCLIB en segundo plano.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}
