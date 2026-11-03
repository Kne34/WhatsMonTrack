import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  turbopack: {},
  // Local `next dev` without nginx: forward /api to a local API. Not used when the frontend calls a
  // separate API host directly (NEXT_PUBLIC_API_URL, e.g. Vercel -> Render).
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_PROXY_TARGET || 'http://localhost:3000'}/api/:path*`,
      },
    ];
  }
};

export default nextConfig;
