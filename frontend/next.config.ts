import type { NextConfig } from "next";

// Адрес FastAPI. Фронтенд проксирует /api/* — cookie сессии остаются same-origin.
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Только для `next dev`: открывать панель с телефона по IP локальной сети или через туннель
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", "*.trycloudflare.com", "*.ngrok-free.app"],
  // Самодостаточная сборка для Docker: node .next/standalone/server.js
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
