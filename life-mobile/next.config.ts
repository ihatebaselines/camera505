import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {},
  // Disable webpack filesystem cache: on Windows the incremental cache gets
  // corrupted by AV scans / concurrent builds, causing the recurring
  // "Cannot find module './531.js' / './627.js'" runtime errors.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
      { source: '/ws/:path*', destination: 'http://localhost:8000/ws/:path*' },
    ];
  },
};

export default nextConfig;
