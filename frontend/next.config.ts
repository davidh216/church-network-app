import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser always calls the relative /api; the Next.js server proxies it to
  // the backend so the session cookie stays first-party (contract 1.1).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:5000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
