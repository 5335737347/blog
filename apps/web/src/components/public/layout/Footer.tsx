import Link from "next/link";
import { KunFishIcon } from "@/components/public/layout/SiteIcons";

interface FooterProps {
  blogTitle: string;
  blogDescription: string;
}

/**
 * 页脚:单行。左侧品牌(logo + 站名 + 描述),右侧版权。
 *
 * 站主 2026-09-18 定稿:不再放社交链接、站点导航、RSS 图标与管理入口——
 * 导航由粘性头部承担,RSS 靠 <head> 里的自动发现链接被订阅器发现,
 * /admin 直接输入地址访问。页脚只保留身份与版权。
 */
export default function Footer({ blogTitle, blogDescription }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-bg-subtle">
      <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-5 sm:px-6">
        <span className="shrink-0 text-micro text-ink-3">
          © {year} {blogTitle}
        </span>
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            aria-label={`${blogTitle} 主页`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-sm bg-primary-solid text-white"
          >
            <KunFishIcon className="h-4.5 w-4.5" />
          </Link>
          <span className="truncate text-sm font-bold tracking-tight text-ink">{blogTitle}</span>
          {blogDescription && (
            <span className="hidden min-w-0 truncate text-micro text-ink-3 md:inline">
              <span className="mr-2.5 text-border-strong">|</span>
              {blogDescription}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
