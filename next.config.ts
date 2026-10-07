import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Para Docker: .next/standalone trae solo lo necesario para correr con `node server.js`.
  output: "standalone",
  // Spotify no acepta "localhost" como redirect: la app se abre en http://127.0.0.1:3000
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
