import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Supports AI generation form uploads (up to 5 files, 20MB each).
      bodySizeLimit: "120mb",
    },
  },
  async rewrites() {
    const gameBase = String(process.env.GAME_SVC_URL || "").replace(/\/+$/, "");
    if (!gameBase) return [];
    return [
      {
        source: "/api/game/:path*",
        destination: `${gameBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
