import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify no acepta "localhost" como redirect: la app se abre en http://127.0.0.1:3000
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
