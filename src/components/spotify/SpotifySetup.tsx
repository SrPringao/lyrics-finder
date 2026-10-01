"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SpotifySetup({
  hasClientId,
  maskedClientId,
  source,
  connectedAs,
  origin,
  onLocalhost,
}: {
  hasClientId: boolean;
  maskedClientId: string | null;
  source: "env" | "code" | "ui";
  connectedAs: string | null;
  origin: string;
  onLocalhost: boolean;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [editing, setEditing] = useState(!hasClientId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const redirectUri = `${origin}/api/spotify/callback`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/spotify/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setEditing(false);
      setClientId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // el usuario puede seleccionarlo a mano
    }
  }

  const connectHref = `${origin}/api/spotify/login?next=/buscar`;

  return (
    <div className="space-y-6">
      {hasClientId && !editing && (
        <section className="space-y-3 border-t border-hairline pt-6">
          <p className="text-sm text-ink">
            App de Spotify configurada (Client ID <code className="font-mono">{maskedClientId}</code>
            {source === "env" ? ", desde .env.local" : source === "code" ? ", incluido en la app" : ""}).
          </p>
          {connectedAs ? (
            <p className="text-sm text-accent">Conectado como {connectedAs}.</p>
          ) : (
            <a
              href={connectHref}
              className="inline-flex rounded-full bg-spotify px-4 py-2 text-sm font-semibold text-white hover:bg-spotify-hover"
            >
              Conectar Spotify
            </a>
          )}
          {source === "ui" && (
            <button onClick={() => setEditing(true)} className="block text-xs text-secondary underline hover:text-ink">
              Cambiar Client ID
            </button>
          )}
        </section>
      )}

      {editing && (
        <section className="space-y-5 border-t border-hairline pt-6">
          <p className="text-sm text-ink">
            Spotify solo permite iniciar sesión desde aplicaciones registradas. Regístrala una vez (2 minutos) y listo: después
            solo picas &quot;Conectar Spotify&quot; y aceptas, igual que en TuneMyMusic.
          </p>

          <ol className="list-decimal space-y-3 pl-5 text-sm text-ink">
            <li>
              Abre{" "}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-accent underline">
                developer.spotify.com/dashboard
              </a>
              , inicia sesión y haz clic en <strong>Create app</strong>.
            </li>
            <li>Ponle cualquier nombre y descripción (por ejemplo &quot;Letras de mis playlists&quot;).</li>
            <li>
              En <strong>Redirect URIs</strong> pega exactamente esto y presiona <strong>Add</strong>:
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-[6px] bg-pill px-2 py-1 font-mono text-xs">{redirectUri}</code>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-full bg-pill px-3 py-1 text-xs hover:bg-hairline"
                >
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            </li>
            <li>
              En <strong>Which API/SDKs</strong> marca <strong>Web API</strong> y <strong>Web Playback SDK</strong>, acepta los
              términos y guarda.
            </li>
            <li>
              Abre la app que creaste, entra a <strong>Settings</strong> y copia el <strong>Client ID</strong> (no hace falta el
              Client Secret). Pégalo aquí:
            </li>
          </ol>

          <form onSubmit={save} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client ID (32 caracteres)"
              spellCheck={false}
              autoComplete="off"
              className="flex-1 border-0 border-b border-input-underline bg-transparent px-0 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            <button
              disabled={busy || !clientId.trim()}
              className="rounded-full bg-ink px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </form>
          {error && <p className="text-[13px] text-warn">{error}</p>}

          <p className="text-xs text-secondary">
            Para que tus amigos usen la app con su cuenta, agrega su correo en <strong>User Management</strong> dentro de tu app
            de Spotify (máximo 5 personas).
          </p>
        </section>
      )}

      {onLocalhost && (
        <p className="text-xs text-secondary">
          Nota: al conectar, la app se abrirá en {origin} en lugar de localhost; Spotify lo exige. Usa esa dirección de ahora
          en adelante.
        </p>
      )}
    </div>
  );
}
