import Header from "@/components/public/layout/Header";
import Footer from "@/components/public/layout/Footer";
import BackToTop from "@/components/public/layout/BackToTop";
import CookieNotice from "@/components/public/layout/CookieNotice";
import { getPublicSettings } from "@/lib/api/public-api";

export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();
  return (
    <>
      <a href="#main-content" className="skip-link">跳到主要内容</a>
      <Header blogTitle={settings.blogTitle} />
      <main id="main-content" className="flex-1" tabIndex={-1}>{children}</main>
      <Footer blogTitle={settings.blogTitle} />
      <BackToTop />
      <CookieNotice />
    </>
  );
}
