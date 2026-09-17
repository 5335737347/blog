import Link from "next/link";
import { getProfile } from "@/lib/api/public-api";
import { KunFishIcon } from "@/components/public/layout/SiteIcons";
import pkg from "../../../../package.json";

interface FooterProps {
  blogTitle: string;
  blogDescription: string;
}

const CONTENT_NAV = [
  { href: "/articles", label: "全部文章" },
  { href: "/archive", label: "归档" },
  { href: "/about", label: "个人介绍" },
  { href: "/now", label: "近况" },
  { href: "/messages", label: "留言" },
];

const SITE_NAV = [
  { href: "/rss.xml", label: "RSS 订阅" },
  { href: "/sitemap.xml", label: "站点地图" },
];

export default async function Footer({ blogTitle, blogDescription }: FooterProps) {
  // getProfile 内部有 cache()，与 /about 等页面在同一请求内只查一次。
  const { socialLinks } = await getProfile();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-bg-subtle">
      <div className="mx-auto max-w-content px-5 py-12 sm:px-6 sm:py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-sm bg-primary-solid text-white">
                <KunFishIcon className="h-5 w-5" />
              </span>
              <span className="text-base font-bold tracking-tight text-ink">{blogTitle}</span>
            </Link>
            {blogDescription && (
              <p className="mt-3 max-w-sm text-meta leading-relaxed text-ink-2">{blogDescription}</p>
            )}
            {socialLinks.length > 0 && (
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                {socialLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="footer-link"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="页脚内容导航">
            {/*
              页脚的分组标题用 h3 而不是 h2。
              页脚在源码顺序上位于主内容之后，但在流式渲染下它会先于主内容到达
              文档流，于是文档里的标题序列变成 `h2 h2 h1 …`——
              axe 的 heading-order 因此在列表页/分类页/标签页触发（12 次运行）。
              h3 不会与主内容的 h1/h2 争层级，也不影响视觉。
            */}
            <h3 className="mb-4 text-meta font-semibold text-ink">浏览</h3>
            <ul className="grid gap-2.5">
              {CONTENT_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="footer-link">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="mb-4 text-meta font-semibold text-ink">订阅与本站</h3>
            <ul className="grid gap-2.5">
              {SITE_NAV.map((item) => (
                <li key={item.href}>
                  {/*
                    prefetch={false}：/rss.xml 与 /sitemap.xml 是文档而非应用路由，
                    预取它们只会让 Next 抓取一份用不上的 RSC 载荷
                    （实测每页多出约 64 KB：rss.xml?_rsc=… 48.4 KB、sitemap.xml?_rsc=… 15.9 KB）。
                  */}
                  <Link href={item.href} prefetch={false} className="footer-link">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="text-meta text-ink-3">版本 v{pkg.version}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-micro text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {blogTitle} · 保留所有权利
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Powered by Next.js + TypeScript</span>
            <Link href="/admin" className="transition-colors hover:text-primary-deep">
              管理
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
