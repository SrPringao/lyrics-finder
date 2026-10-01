// Tipos mínimos del Web Playback SDK (https://sdk.scdn.co/spotify-player.js)
declare namespace Spotify {
  interface PlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: { current_track: { name: string; uri: string; artists: { name: string }[] } };
  }
  interface Player {
    connect(): Promise<boolean>;
    disconnect(): void;
    activateElement(): Promise<void>;
    togglePlay(): Promise<void>;
    addListener(event: "ready" | "not_ready", cb: (e: { device_id: string }) => void): boolean;
    addListener(event: "player_state_changed", cb: (s: PlaybackState | null) => void): boolean;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (e: { message: string }) => void,
    ): boolean;
  }
  interface PlayerConstructor {
    new (opts: { name: string; getOAuthToken: (cb: (token: string) => void) => void; volume?: number }): Player;
  }
}

interface Window {
  Spotify?: { Player: Spotify.PlayerConstructor };
  onSpotifyWebPlaybackSDKReady?: () => void;
}
