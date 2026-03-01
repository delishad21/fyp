import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Supports AI generation form uploads (up to 5 files, 20MB each).
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
