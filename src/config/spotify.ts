/**
 * Client ID de la app registrada en https://developer.spotify.com/dashboard.
 *
 * No es secreto: el login usa PKCE (sin client secret) y Spotify lo muestra en la URL de
 * autorización. Va en el código para que cualquiera que use la app solo tenga que picar
 * "Conectar Spotify" y aceptar. Se puede sobrescribir con SPOTIFY_CLIENT_ID en .env.local.
 */
export const SPOTIFY_CLIENT_ID = "02e004b1ef9d4ed48eef837421b4c184";
