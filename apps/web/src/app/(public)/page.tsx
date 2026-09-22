import type { Metadata } from "next";
import HeroSection from "@/components/public/home/HeroSection";
import HomeContent from "@/components/public/home/HomeContent";
import { getHomePageData, getHomeWallpapers, getProfile, getPublicSettings } from "@/lib/api/public-api";
import { getOpenGraphImageUrl } from "@/lib/env";
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
  const settings = await getPublicSettings();
  // openGraph 是整体替换（浅合并）：只写 url 会把根布局的 og:title/
  // description/image 全部清掉，这里必须带完整字段。
  return {
    alternates: pageAlternates("/"),
    openGraph: {
      title: settings.blogTitle,
      description: settings.blogDescription,
      type: "website",
      url,
      images: [getOpenGraphImageUrl()],
    },
  };
}

export default async function HomePage() {
  const [settings, home, profile, wallpapers] = await Promise.all([
    getPublicSettings(),
    getHomePageData(),
    getProfile(),
    getHomeWallpapers(),
  ]);

  return (
    <>
      <HeroSection
        blogTitle={settings.blogTitle}
        blogDescription={settings.blogDescription}
        wallpapers={wallpapers.map((item) => item.url)}
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
