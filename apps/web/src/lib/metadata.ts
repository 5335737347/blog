import { getSiteUrl } from "@/lib/env";

/**
 * 页面级 `alternates` 的统一来源。
 *
 * 为什么需要这个函数：Next 的 metadata 是**浅合并**的——页面导出的
 * `alternates` 会整体替换布局里的 `alternates`，不做字段合并
 *（见 node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md
 * 的 "Merging" 一节：「Duplicate keys are replaced based on their ordering」）。
 *
 * 实际后果：根布局声明了 `<link rel="alternate" type="application/rss+xml">`，
 * 而每个页面又各自导出 `alternates: { canonical }`，于是这个 RSS 自动发现链接
 * 在**所有页面上都消失了**——线上实测首页/文章/关于/留言/归档全部为 0 个。
 * 订阅器和浏览器扩展就找不到 feed，页脚那个「RSS 订阅」成了唯一入口。
 *
 * 所以只要页面要写 canonical，就必须同时带上 `types`。这里统一构造，
 * 避免以后再出现「某个新页面忘了写 types」。
 *
 * 用绝对 URL：canonical 会被 metadataBase 解析，`types` 不保证会被解析，
 * 两种情况混在一起容易产生相对当前路径的意外结果，统一绝对地址最稳。
 */
export function pageAlternates(canonicalPath: string, query?: string) {
  const siteUrl = getSiteUrl();
  // query 用于分页页面的自指 canonical（?page=2 指向自身而非第一页）：
  // 搜索/筛选等 noindex 页面不需要传。
  const suffix = query ? `?${query}` : "";
  return {
    canonical: `${siteUrl}${canonicalPath}${suffix}`,
    types: { "application/rss+xml": `${siteUrl}/rss.xml` },
  };
}
