import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

// 站点地图不需要每次请求都重新生成。
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  // API 短暂不可用时退化为只输出静态页面，而不是让整个 sitemap 返回 500。
  // 配合上面的 revalidate，正常情况下爬虫拿到的仍是上一份成功生成的版本。
  let posts: Awaited<ReturnType<typeof getSitemapData>>["posts"] = [];
  let tags: Awaited<ReturnType<typeof getSitemapData>>["tags"] = [];
  let categories: Awaited<ReturnType<typeof getSitemapData>>["categories"] = [];
  try {
    ({ posts, tags, categories } = await getSitemapData());
  } catch (error) {
    // 只打印一行：构建期会并行预渲染，完整错误对象会在日志里刷出多份堆栈。
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[sitemap] 无法获取内容数据（${reason}），退化为仅静态页面。`);
  }

  const postUrls: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${siteUrl}/articles/${post.slug}`,
    lastModified: new Date(post.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const tagUrls: MetadataRoute.Sitemap = tags.map((tag) => ({
    url: `${siteUrl}/tags/${tag.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const categoryUrls: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/categories/${category.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    {
      url: siteUrl,
      // 用最新文章时间而不是 new Date()：后者每次请求都变，会让 lastmod 失去意义，
      // 也会让站点地图无法被有效缓存。
      lastModified: posts[0]?.updatedAt ? new Date(posts[0].updatedAt) : undefined,
      changeFrequency: "daily",
      priority: 1,
    },
    ...["articles", "archive", "about", "messages", "now"].map((path) => ({
      url: `${siteUrl}/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
    ...postUrls,
    ...tagUrls,
    ...categoryUrls,
  ];
}
