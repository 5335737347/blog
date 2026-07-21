import HeroSection from "@/components/public/home/HeroSection";
import { getPublicSettings } from "@/lib/api/public-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = await getPublicSettings();

  return (
    <HeroSection
      blogTitle={settings.blogTitle}
      blogDescription={settings.blogDescription}
    />
  );
}
