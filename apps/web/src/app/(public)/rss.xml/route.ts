import { Feed } from "feed";
import type { NextRequest } from "next/server";
import { getRssFeedData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl() || request.nextUrl.origin;
  const { posts, settings } = await getRssFeedData();

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
