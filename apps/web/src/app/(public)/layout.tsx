import Header from "@/components/public/layout/Header";
import Footer from "@/components/public/layout/Footer";
import MobileTabBar from "@/components/public/layout/MobileTabBar";
import BackToTop from "@/components/public/layout/BackToTop";
import CookieNotice from "@/components/public/layout/CookieNotice";
import { getPublicSettings } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

// 公开外壳不读取 cookies/headers，可以静态化并按 60s 重新验证，
// 避免每次浏览都重新 SSR 并重复拉取设置。
export const revalidate = 60;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();
  const siteUrl = getSiteUrl();
  const websiteJsonLd = siteUrl
    ? {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: settings.blogTitle,
        description: settings.blogDescription,
        url: siteUrl,
      }
    : null;

  return (
    <>
      {websiteJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <Header blogTitle={settings.blogTitle} />
      {/* pb-14 为移动端底部标签栏留位，lg 以上取消 */}
      <main id="main-content" className="flex-1 pb-14 lg:pb-0" tabIndex={-1}>{children}</main>
      <Footer blogTitle={settings.blogTitle} blogDescription={settings.blogDescription} />
      <MobileTabBar />
      <BackToTop />
      <CookieNotice />
    </>
  );
}
