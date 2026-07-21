import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "../../.env.local"), override: false });
loadEnv({ path: path.resolve(__dirname, "../../.env"), override: false });

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl?.startsWith("file:./")) {
  process.env.DATABASE_URL = `file:${path.resolve(__dirname, "../..", databaseUrl.slice("file:./".length))}`;
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  transpilePackages: ["@kpblog/contracts"],
  async rewrites() {
    const apiUrl = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
