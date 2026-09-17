import type { Metadata } from "next";
import HeroSection from "@/components/public/home/HeroSection";
import HomeContent from "@/components/public/home/HomeContent";
import { getHomePageData, getProfile, getPublicSettings } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { pageAlternates } from "@/lib/metadata";

export const revalidate = 60;

/**
 * 首页的 canonical 与 og:url。
 *
 * 根 layout 的 metadata 不带 canonical（带上就会成为所有页面的默认值），
 * 所以每个页面自己声明。评估中实测：文章/分类/标签/关于/留言都有 canonical，
 * 只有首页缺失。
 */
export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const url = siteUrl ? `${siteUrl}/` : undefined;
  return {
    alternates: pageAlternates("/"),
    openGraph: { url },
  };
}

export default async function HomePage() {
  const [settings, home, profile] = await Promise.all([
    getPublicSettings(),
    getHomePageData(),
    getProfile(),
  ]);

  return (
    <>
      <HeroSection
        blogTitle={settings.blogTitle}
        blogDescription={settings.blogDescription}
      />
      <HomeContent
        recentPosts={home.recentPosts}
        categories={home.categories}
        tags={home.tags}
        profile={{ now: profile.now, headline: profile.headline, name: profile.name }}
      />
    </>
  );
}
