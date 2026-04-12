import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable React strict mode
  reactStrictMode: true,

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

  // Proxy API requests to PocketBase and aepbase.
  // The browser talks to same-origin paths under /api/* and Next.js forwards
  // them to the right backend. Avoids CORS and Cloudflare Access blocking,
  // and means clients never address either backend directly.
  //
  // /api/pb/*  — legacy PocketBase (being migrated away)
  // /api/aep/* — aepbase (the new backend)
  //
  // Both default to :8090, so during the migration they cannot run on the
  // same port at the same time. Override either via env var:
  //   POCKETBASE_URL=http://127.0.0.1:8090
  //   AEPBASE_URL=http://127.0.0.1:8091
  async rewrites() {
    const pocketbaseUrl = process.env.POCKETBASE_URL || 'http://127.0.0.1:8090';
    const aepbaseUrl = process.env.AEPBASE_URL || 'http://127.0.0.1:8090';
    return [
      {
        source: '/api/pb/:path*',
        destination: `${pocketbaseUrl}/:path*`,
      },
      {
        source: '/api/aep/:path*',
        destination: `${aepbaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
