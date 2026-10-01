"use client";

import { useSpotify } from "@/components/spotify/SpotifyProvider";

export function Toast() {
  const { message } = useSpotify();
  if (!message) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-[88px] left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-[12px] px-4 py-2.5 text-[13px] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] lg:bottom-6 lg:left-[calc((100%-480px)/2)] ${
        message.error ? "bg-warn" : "bg-ink"
      }`}
    >
      {message.text}
    </div>
  );
}
