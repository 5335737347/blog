import { prisma } from "@/lib/prisma";
import { Feed } from "feed";

export async function GET() {
  const siteUrl = process.env.SITE_URL || "http://localhost:3000";

  const [posts, settings] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        content: true,
        coverImage: true,
        publishedAt: true,
        tags: {
          select: { tag: { select: { name: true } } },
        },
      },
    }),
    prisma.setting.findMany(),
  ]);

  const settingsMap = Object.fromEntries(
    settings.map((s) => [s.key, s.value])
  );
  const blogTitle = settingsMap.blog_title || "My Blog";
  const blogDescription =
    settingsMap.blog_description || "一个关于技术和生活的个人博客";

  const feed = new Feed({
    title: blogTitle,
    description: blogDescription,
    id: siteUrl,
    link: siteUrl,
    language: "zh-CN",
    favicon: `${siteUrl}/favicon.ico`,
    copyright: `All rights reserved ${new Date().getFullYear()}`,
    updated: posts[0]?.publishedAt || new Date(),
    feedLinks: {
      rss2: `${siteUrl}/rss.xml`,
    },
    author: {
      name: blogTitle,
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
      date: post.publishedAt || new Date(),
      category: post.tags.map((t) => ({ name: t.tag.name })),
    });
  }

  return new Response(feed.rss2(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
