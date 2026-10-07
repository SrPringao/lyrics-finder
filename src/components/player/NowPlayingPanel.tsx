"use client";

import { usePathname } from "next/navigation";
import { Cover } from "@/components/Cover";
import { CloseIcon } from "@/components/Icons";
import { Controls, VolumeSlider } from "@/components/player/Controls";
import { LyricsScroller } from "@/components/player/LyricsScroller";
import { AccountMenu, DeviceMenu } from "@/components/player/Menus";
import { ProgressBar } from "@/components/player/ProgressBar";
import { useSpotify } from "@/components/spotify/SpotifyProvider";
import { useIsGuest } from "@/components/ViewerProvider";

const coverShadow = "0 14px 30px rgba(40,60,35,0.28)";

/** Panel "Ahora suena": columna derecha en escritorio y hoja a pantalla completa en celular. */
export function NowPlayingPanel({ onClose }: { onClose?: () => void }) {
  const { status, track } = useSpotify();
  const pathname = usePathname();
  const guest = useIsGuest();
  const connected = !!status?.connected;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 bg-tint px-6 pt-7 pb-8 text-tint-ink sm:px-10">
      <div className="flex min-h-[30px] items-center justify-between gap-3">
        {connected ? <DeviceMenu /> : <span />}
        <div className="flex items-center gap-2">
          {connected && <AccountMenu />}
          {onClose && (
            <button type="button" aria-label="Cerrar reproductor" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-tint-ink">
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {!status ? (
        <div className="flex-grow" />
      ) : !connected ? (
        <>
          <Cover url={null} size={132} radius={12} placeholderClassName="bg-white/50 text-tint-secondary" />
          <div className="flex flex-col items-start gap-4">
            {guest ? (
              <p className="text-[20px] font-bold tracking-[-0.02em]">Spotify no está conectado</p>
            ) : (
              <>
            <p className="text-[20px] font-bold tracking-[-0.02em]">Conecta Spotify para escuchar desde aquí</p>
            <a
              href={status.configured ? `/api/spotify/login?next=${encodeURIComponent(pathname)}` : "/spotify"}
              className="rounded-full bg-spotify px-4 py-2 text-sm font-semibold text-white hover:bg-spotify-hover"
            >
              Conectar Spotify
            </a>
              </>
            )}
          </div>
          <div className="flex-grow" />
        </>
      ) : (
        <>
          {status.product && status.product !== "premium" && (
            <p className="rounded-[10px] bg-white/50 px-3 py-2 text-xs text-tint-secondary">
              Tu cuenta no es Premium: Spotify no permite reproducir desde otras apps.
            </p>
          )}
          <div className="flex items-end gap-[18px]">
            <Cover url={track?.coverUrl} size={132} radius={12} shadow={track ? coverShadow : undefined} placeholderClassName="bg-white/50 text-tint-secondary" />
            <div className="min-w-0 pb-1">
              {track ? (
                <>
                  <div className="line-clamp-2 text-[20px] font-bold tracking-[-0.02em]">{track.title}</div>
                  <div className="truncate text-sm text-tint-secondary">{track.artist}</div>
                </>
              ) : (
                <div className="text-[15px] text-tint-secondary">Elige un tiempo en los resultados para empezar</div>
              )}
            </div>
          </div>
          <LyricsScroller />
          <ProgressBar />
          <Controls />
          <VolumeSlider />
        </>
      )}
    </div>
  );
}
