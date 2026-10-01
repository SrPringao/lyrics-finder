import { headers } from "next/headers";
import { SpotifySetup } from "@/components/spotify/SpotifySetup";
import { SPOTIFY_CLIENT_ID } from "@/config/spotify";
import { getDb } from "@/lib/db";
import { getAuth, getClientId } from "@/lib/spotify/auth";

export default async function SpotifyPage() {
  const host = (await headers()).get("host") ?? "127.0.0.1:3000";
  const [hostname, port = "3000"] = host.split(":");
  const db = getDb();
  const clientId = getClientId(db);
  const fromEnv = !!process.env.SPOTIFY_CLIENT_ID?.trim();
  const fromCode = !fromEnv && !!SPOTIFY_CLIENT_ID;
  const auth = getAuth(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar Spotify</h1>
        <p className="mt-1 text-sm text-stone-600">
          Al conectar tu cuenta (Premium), cada tiempo de la letra se vuelve un botón que reproduce la canción desde ese
          segundo.
        </p>
      </div>
      <SpotifySetup
        hasClientId={!!clientId}
        maskedClientId={clientId ? `${clientId.slice(0, 4)}…${clientId.slice(-4)}` : null}
        source={fromEnv ? "env" : fromCode ? "code" : "ui"}
        connectedAs={auth?.display_name ?? (auth ? "tu cuenta" : null)}
        // Spotify exige 127.0.0.1 (no "localhost") en la dirección de regreso.
        origin={process.env.SPOTIFY_REDIRECT_URI ? new URL(process.env.SPOTIFY_REDIRECT_URI).origin : `http://127.0.0.1:${port}`}
        onLocalhost={hostname === "localhost"}
      />
    </div>
  );
}
