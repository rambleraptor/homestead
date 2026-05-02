import { execSync } from 'child_process';
import type { NextConfig } from 'next';

// Capture git commit info at build time so the settings screen can display
// which revision of Homestead is running. Falls back to 'unknown' if git is
// unavailable (e.g. a shallow Docker build without the .git directory).
function readGit(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const commitHash = readGit('rev-parse HEAD');
const commitDate = readGit('log -1 --pretty=format:%cI');
const commitMessage = readGit('log -1 --pretty=format:%s');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rambleraptor/homestead-modules'],

  // Hide the Next.js dev-mode indicator (bottom-left overlay). It overlaps
  // the sidebar's logout button at the default Playwright viewport and
  // intercepts pointer events during E2E tests. The indicator adds no value
  // to our normal dev workflow either.
  devIndicators: false,

  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_COMMIT_DATE: commitDate,
    NEXT_PUBLIC_COMMIT_MESSAGE: commitMessage,
  },

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
