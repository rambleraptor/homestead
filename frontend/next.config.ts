import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

  // Output standalone build for Docker deployment
  output: 'standalone',

  // Transpile specific packages if needed
  transpilePackages: [],

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.pocketbase.io',
      },
    ],
  },

  // Proxy API requests to PocketBase
  // This allows the frontend to make requests to /api/pb/* which Next.js
  // will forward to the local PocketBase instance at http://127.0.0.1:8090
  // This solves CORS issues and Cloudflare Access blocking
  async rewrites() {
    return [
      {
        source: '/api/pb/:path*',
        destination: 'http://127.0.0.1:8090/api/:path*',
      },
    ];
  },
};

export default nextConfig;
