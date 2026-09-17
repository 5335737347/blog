import HeroSection from "@/components/public/home/HeroSection";
import HomeContent from "@/components/public/home/HomeContent";
import { getHomePageData, getProfile, getPublicSettings } from "@/lib/api/public-api";

export const revalidate = 60;

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
