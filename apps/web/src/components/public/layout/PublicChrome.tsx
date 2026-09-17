import Header from "@/components/public/layout/Header";
import Footer from "@/components/public/layout/Footer";
import BackToTop from "@/components/public/layout/BackToTop";
import CookieNotice from "@/components/public/layout/CookieNotice";
import { getPublicSettings } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

/**
 * 公开站点的外壳（跳转链接 + 头部 + 主内容 + 页脚 + Cookie 提示）。
 *
 * 2026-09-17：移除了移动端底部标签栏。它与头部汉堡菜单指向同一批目标
 *（首页/文章/归档/留言/关于 vs 文章/归档/个人介绍/近况/留言），
 * 小屏上出现两套等价导航；现在统一由头部菜单承担移动端导航。
 *
 * 之所以抽成组件而不是只留在 `(public)/layout.tsx`：
 * 根级 `app/not-found.tsx` 不在 `(public)` 路由组内，拿不到那个 layout，
 * 于是未匹配的 URL 会落到 Next 默认 404 页面（英文文案、无站点头尾，
 * 实测 hasHeader=false hasFooter=false）。把外壳抽出来，两处共用同一份实现，
 * 未匹配路径也能得到与站内一致的 404 外观。
 */
export default async function PublicChrome({ children }: { children: React.ReactNode }) {
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
      <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
      <Footer blogTitle={settings.blogTitle} blogDescription={settings.blogDescription} />
      <BackToTop />
      <CookieNotice />
    </>
  );
}
