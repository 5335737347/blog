import "server-only";
import { getSiteUrl } from "@/lib/env";

/**
 * 判断封面图是否应跳过 next/image 优化。
 *
 * 之前只要 URL 以 http(s) 开头就跳过优化，等于让所有绝对 URL 封面图
 * 退化成未压缩、无 srcset 的原图。实际上只有两种情况必须跳过：
 *
 * 1. SVG —— next/image 不对矢量图做栅格优化；
 * 2. 不在 next.config.ts `images.remotePatterns` 白名单内的远端主机 ——
 *    否则 next/image 会直接抛 "hostname is not configured"。
 *
 * 白名单只包含本站域名（由 SITE_URL 派生），因此这里的判断规则必须与之一致。
 * 部署时请保证构建期与运行期的 SITE_URL 相同（单机部署下二者共用同一份 .env）。
 */
export function shouldSkipImageOptimization(src: string): boolean {
  if (!src) return true;
  if (src.toLowerCase().endsWith(".svg")) return true;

  // 站内相对路径始终可以优化。
  if (!/^https?:\/\//i.test(src)) return false;

  const siteUrl = getSiteUrl();
  if (!siteUrl) return true;

  try {
    const source = new URL(src);
    const site = new URL(siteUrl);
    // remotePatterns 同时约束 protocol 与 hostname；只比 hostname 时，
    // https 站点上的 http://同域 图片不会被判为“跳过优化”，
    // 但 Next 白名单里没有该 http 条目，会在运行时报错。
    return source.protocol !== site.protocol || source.hostname !== site.hostname;
  } catch {
    return true;
  }
}
