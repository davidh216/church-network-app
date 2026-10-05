import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server for the container image (frontend/Dockerfile). The tracing root is
  // the workspace root because dependencies are hoisted to the root node_modules.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  // The browser always calls the relative /api; the Next.js server proxies it to
  // the backend so the session cookie stays first-party (contract 1.1).
  // Rewrites are resolved at build time: API_URL must be set when `next build` runs.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:5000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
