import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import { loadProjectEnv, repositoryRoot } from "../../scripts/load-env.mjs";

// 环境加载统一走 scripts/load-env.mjs，与 API、Prisma CLI、仓库脚本同一份实现。
// 此前这里自己解析 .env 路径，还用 `__dirname` 拼相对位置。
loadProjectEnv();

// 顺带删掉了原本对 DATABASE_URL 的归一化：web 侧从来不用它（架构规则是
// 「Web 不直接连接 Prisma」），那段是死代码，而且是第三套与别处都不同的
// `file:./dev.db` 解析方式——留着只会让人以为 web 会碰数据库。

/**
 * 允许 next/image 优化的远端主机：只放行本站自己的域名。
 * 不配置 remotePatterns 时，绝对 URL 封面图只能走 unoptimized，
 * 等于完全放弃 WebP/AVIF 与 srcset；但用通配符放行任意主机又会让
 * /_next/image 变成可被滥用的开放图片代理。折中为只信任 SITE_URL。
 */
function siteImagePatterns() {
  const candidates = [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL];
  const patterns: { protocol: "http" | "https"; hostname: string }[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const { protocol, hostname } = new URL(candidate);
      if (protocol !== "http:" && protocol !== "https:") continue;
      const entry = { protocol: protocol.replace(":", "") as "http" | "https", hostname };
      if (!patterns.some((p) => p.hostname === entry.hostname && p.protocol === entry.protocol)) {
        patterns.push(entry);
      }
    } catch {
      // 无效 URL 在运行时由 getSiteUrl() 统一处理。
    }
  }
  return patterns;
}

/**
 * 开发期允许访问 Next dev 资源（HMR 等）的来源。
 *
 * Next 16 默认只信任启动时打印的 Local 地址；用 127.0.0.1 或局域网 IP 打开时
 * 会被判为跨源，/_next/hmr 被拦掉，热更新失效并打印警告。
 *
 * 局域网地址由 DHCP 分配、会变（本机就同时有有线和无线两个），
 * 因此运行时枚举本机网卡，而不是写死 IP。
 * 该选项只影响 `next dev`，对生产构建没有作用。
 */
function allowedDevOrigins(): string[] {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        hosts.add(address.address);
      }
    }
  }

  // 仍需显式补充的来源（临时隧道等），与 API 的同源校验共用一份配置。
  for (const entry of (process.env.ALLOWED_ORIGINS || "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      hosts.add(new URL(trimmed).host);
    } catch {
      // 非法项由 API 侧的 request-guard 统一告警，这里静默跳过。
    }
  }

  return [...hosts];
}

const nextConfig: NextConfig = {
  turbopack: {
    root: repositoryRoot,
  },
  // 不向客户端暴露框架版本。
  poweredByHeader: false,
  allowedDevOrigins: allowedDevOrigins(),
  transpilePackages: ["@kpblog/contracts"],
  // 允许用环境变量指定构建目录：冒烟检查要在不干扰开发者已运行的 dev server
  // 的前提下起自己的实例（Next 16 不允许同目录两个 dev server 共用 .next）。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  images: {
    remotePatterns: siteImagePatterns(),
    formats: ["image/avif", "image/webp"],
  },
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
