import { NoteIcon } from "@/components/Icons";

/**
 * Portada del álbum (las da Spotify al vincular o al reproducir). Sin portada: un cuadro neutro
 * con una nota musical.
 */
export function Cover({
  url,
  size,
  radius,
  className = "",
  shadow,
  placeholderClassName = "bg-pill text-disabled",
}: {
  url: string | null | undefined;
  size: number;
  radius: number;
  className?: string;
  shadow?: string;
  placeholderClassName?: string;
}) {
  const style = { width: size, height: size, borderRadius: radius, boxShadow: shadow };
  if (url) {
    // Imágenes del CDN de Spotify; no pasan por next/image.
    return <img src={url} alt="" width={size} height={size} style={style} className={`shrink-0 object-cover ${className}`} />;
  }
  return (
    <div style={style} className={`flex shrink-0 items-center justify-center ${placeholderClassName} ${className}`} aria-hidden>
      <NoteIcon size={Math.max(14, Math.round(size * 0.32))} />
    </div>
  );
}
