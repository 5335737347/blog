"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArticleIcon, CalendarIcon, HomeIcon, MessageIcon, ProfileIcon } from "./SiteIcons";

const TABS = [
  { href: "/", label: "首页", icon: HomeIcon },
  { href: "/articles", label: "文章", icon: ArticleIcon },
  { href: "/archive", label: "归档", icon: CalendarIcon },
  { href: "/messages", label: "留言", icon: MessageIcon },
  { href: "/about", label: "关于", icon: ProfileIcon },
];

/**
 * 移动端底部标签栏：`lg` 以下显示，滚动向下时隐藏、向上时出现。
 * 页面底部留出等高内边距，避免遮挡页脚内容。
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // 只在明显向下滚动时隐藏，且首屏始终显示
      setHidden(y > last + 6 && y > 160);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="移动端主导航"
      data-print="hide"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 backdrop-blur-md transition-transform duration-200 lg:hidden ${
        hidden ? "translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14 items-stretch">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const on = active(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-micro transition-colors ${
                  on ? "text-primary-deep" : "text-ink-3"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
