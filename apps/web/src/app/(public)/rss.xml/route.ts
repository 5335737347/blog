import { Feed } from "feed";
import { getRssFeedData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

export async function GET() {
  const siteUrl = getSiteUrl();

  let data: Awaited<ReturnType<typeof getRssFeedData>>;
  try {
    data = await getRssFeedData();
  } catch (error) {
    // 返回 503 而不是空 feed：空 feed 会让阅读器与聚合服务认为博客已清空，
    // 503 + Retry-After 才是“稍后重试”的正确语义。
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[rss] 无法获取内容数据（${reason}），返回 503。`);
    return new Response("Feed temporarily unavailable", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "300",
      },
    });
  }

  const { posts, settings } = data;

  const feed = new Feed({
    title: settings.blogTitle,
    description: settings.blogDescription,
    id: siteUrl,
    link: siteUrl,
    language: "zh-CN",
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}`,
    updated: posts[0]?.publishedAt ? new Date(posts[0].publishedAt) : new Date(),
    feedLinks: {
      rss2: `${siteUrl}/rss.xml`,
    },
    author: {
      name: settings.blogTitle,
      link: siteUrl,
    },
  });

  for (const post of posts) {
    const url = `${siteUrl}/articles/${post.slug}`;
    feed.addItem({
      title: post.title,
      id: url,
      link: url,
      description: post.excerpt || "",
      content: post.content,
      // 有封面的文章带 image：支持的阅读器会渲染成附件/头图。
      // 相对路径补全为绝对地址，RSS 规范要求绝对 URL。
      image: post.coverImage
        ? post.coverImage.startsWith("http")
          ? post.coverImage
          : `${siteUrl}${post.coverImage}`
        : undefined,
      date: post.publishedAt ? new Date(post.publishedAt) : new Date(),
      category: post.tags.map((tag) => ({ name: tag.name })),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
