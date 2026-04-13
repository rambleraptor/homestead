import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [],

  images: {
    remotePatterns: [],
  },

  // Proxy API requests to aepbase. The browser talks to same-origin paths
  // under `/api/aep/*` and Next.js forwards them. Avoids CORS and
  // Cloudflare Access blocking, and means clients never address aepbase
  // directly. Override the target via the `AEPBASE_URL` env var.
  async rewrites() {
    const aepbaseUrl = process.env.AEPBASE_URL || 'http://127.0.0.1:8090';
    return [
      {
        source: '/api/aep/:path*',
        destination: `${aepbaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
