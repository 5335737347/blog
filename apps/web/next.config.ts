import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
/**
 * 把 NEXT_DIST_DIR 归一成相对 apps/web 的路径。
 *
 * 绝对路径直接交给 Next 会被当成相对路径二次拼接（见上面 distDir 处的说明）。
 * 相对路径原样返回，行为与以前完全一致。
 */
function relativeDistDir(value: string): string {
  if (!path.isAbsolute(value)) return value;
  const appDir = path.dirname(fileURLToPath(import.meta.url));
  // path.relative 会给出 ../ 开头的相对路径，Next 支持这种写法。
  return path.relative(appDir, value) || value;
}

function apiInternalUrl(): string {
  return (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");
}

/** 当前配置使用的构建目录（与 nextConfig.distDir 保持一致）。 */
function configuredDistDir(): string {
  return process.env.NEXT_DIST_DIR
    ? relativeDistDir(process.env.NEXT_DIST_DIR)
    : ".next";
}

/**
 * 防止 `API_INTERNAL_URL` 的构建期/运行期分叉。
 *
 * Next 把 rewrites() 的结果固化进 `.next/routes-manifest.json`：`next start`
 * 时即使进程环境里的 API_INTERNAL_URL 变了，浏览器 `/api/*` 仍会去构建时的
 * 地址；而服务端 SSR 又是运行时读 process.env。只改环境变量重启 Web 会产生
 * “SSR 连新 API、浏览器连旧 API”的 split-brain。
 *
 * 这里在生产启动时对比 manifest 与当前环境，不一致就直接拒绝启动并给出修复
 * 指令。`next build`/`next dev` 不检查；没有 manifest 时交给 Next 自己报错。
 */
function assertRewriteTargetMatchesRuntimeEnv() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    configuredDistDir(),
    "routes-manifest.json"
  );
  if (!existsSync(manifestPath)) return;

  let destination: string | undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      rewrites?: {
        beforeFiles?: { source?: string; destination?: string }[];
        afterFiles?: { source?: string; destination?: string }[];
        fallback?: { source?: string; destination?: string }[];
      };
    };
    const routes = [
      ...(manifest.rewrites?.beforeFiles ?? []),
      ...(manifest.rewrites?.afterFiles ?? []),
      ...(manifest.rewrites?.fallback ?? []),
    ];
    destination = routes.find((route) => route.source === "/api/:path*")?.destination;
  } catch {
    return; // manifest 不可读时由 Next 在启动阶段自行报错
  }
  if (!destination) return;

  const expected = `${apiInternalUrl()}/api/:path*`;
  if (destination !== expected) {
    throw new Error(
      "API_INTERNAL_URL 与当前构建产物不一致：\n" +
        `  构建时 rewrite 目标：${destination}\n` +
        `  当前环境期望：      ${expected}\n` +
        "API_INTERNAL_URL 的 rewrites 目标是在 next build 时固化的；" +
        "修改该变量后必须重新执行 npm run build（或删除 .next 后重建），" +
        "否则服务端 SSR 与浏览器 /api/* 会指向不同 API。"
    );
  }
}

/**
 * 图片白名单与 rewrite 同源问题：images.remotePatterns 也是 next build 时
 * 固化的。只改运行时 SITE_URL 重启，运行时 shouldSkipImageOptimization 会按新
 * 域名判断，但构建产物仍只信任旧域名，出现“本地图走优化却 400/报错”的错配。
 */
function assertImagePatternsMatchRuntimeEnv() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  const manifestPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    configuredDistDir(),
    "images-manifest.json"
  );
  if (!existsSync(manifestPath)) return;

  let patterns: { protocol?: string; hostname?: string }[] = [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      images?: { remotePatterns?: { protocol?: string; hostname?: string }[] };
    };
    patterns = manifest.images?.remotePatterns ?? [];
  } catch {
    return;
  }

  for (const candidate of [process.env.SITE_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!candidate) continue;
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const protocol = url.protocol.replace(":", "");
    const matched = patterns.some(
      (pattern) =>
        pattern.protocol === protocol &&
        typeof pattern.hostname === "string" &&
        new RegExp(pattern.hostname, "i").test(url.hostname)
    );
    if (!matched) {
      throw new Error(
        `SITE_URL 与当前构建产物的 images.remotePatterns 不一致：${url.origin}\n` +
          "修改 SITE_URL / NEXT_PUBLIC_SITE_URL 后必须重新执行 npm run build，" +
          "否则本站图片优化白名单会与运行时判断错配。"
      );
    }
  }
}

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

assertRewriteTargetMatchesRuntimeEnv();
assertImagePatternsMatchRuntimeEnv();

const nextConfig: NextConfig = {
  turbopack: {
    root: repositoryRoot,
  },
  async redirects() {
    // /archive 在「文章 + 项目」信息架构改造中移除；旧链接 301 到 /projects。
    return [{ source: "/archive", destination: "/projects", permanent: true }];
  },
  // 不向客户端暴露框架版本。
  poweredByHeader: false,
  allowedDevOrigins: allowedDevOrigins(),
  transpilePackages: ["@kpblog/contracts"],
  // 允许用环境变量指定构建目录：冒烟检查要在不干扰开发者已运行的 dev server
  // 的前提下起自己的实例（Next 16 不允许同目录两个 dev server 共用 .next）。
  // Next 把 distDir 当作**相对应用目录**的路径，传绝对路径会被错误地拼到
  // apps/web 下面（实测：/home/.../eval-dist 变成了 apps/web/home/.../eval-dist，
  // 另一个脚本传的绝对路径甚至生成了 230 MB 的 apps/web/eval-3321 并被提交）。
  // 这里显式识别绝对路径并转成相对 apps/web 的路径，保留调用方「指定任意目录」
  // 的意图，同时把产物放到调用方真正想放的位置。
  ...(process.env.NEXT_DIST_DIR
    ? { distDir: relativeDistDir(process.env.NEXT_DIST_DIR) }
    : {}),
  images: {
    remotePatterns: siteImagePatterns(),
    formats: ["image/avif", "image/webp"],
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl()}/api/:path*` }];
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
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      {
        // 上传媒体与仓库自带的壁纸/音乐文件名基本稳定，适合短缓存以减少重复传输；
        // 默认壁纸未来可能同名更新，所以用 1 小时而不是 immutable。
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/music/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
