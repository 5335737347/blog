"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeSelector from "@/components/public/preferences/ThemeSelector";
import MusicToggle from "@/components/public/music/MusicToggle";
import LazyMusicPlayer from "@/components/public/music/LazyMusicPlayer";
import AuthNav from "@/components/public/auth/AuthNav";
import { KunFishIcon, MenuIcon, CloseIcon, SearchIcon } from "./SiteIcons";

const NAV = [
  { href: "/articles", label: "文章" },
  { href: "/archive", label: "归档" },
  { href: "/about", label: "个人介绍" },
  { href: "/now", label: "近况" },
  { href: "/messages", label: "留言" },
];

const MENU_ID = "mobile-menu";

/**
 * 粘性头部：首屏透明，滚动超过 8px 后转实底 + 下边框。
 * hero 页在首屏用白色文字，因此这里通过 `transparent` 状态切换配色。
 */
export default function Header({ blogTitle }: { blogTitle: string }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // 用「打开时所在的路径」判断菜单是否仍然有效，避免用 effect 同步关闭。
  const [menuPath, setMenuPath] = useState(pathname);
  const isHome = pathname === "/";

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    setMenuPath(pathname);
    setMenuOpen(true);
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const menuVisible = menuOpen && menuPath === pathname;

  /**
   * 菜单展开时锁定背景滚动并支持 Esc 关闭。
   *
   * 之前的菜单是「浮在内容上的一层」，背景仍可滚动、点空白处也不关闭，
   * 小屏上很容易误触到下面的内容。锁滚动用 `overflow: hidden` 并补偿
   * 滚动条宽度，避免锁定时页面横向跳动。
   */
  useEffect(() => {
    if (!menuVisible) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    // 让其它贴底浮层（Cookie 提示的 z-index 比遮罩高）在菜单打开时让位，
    // 否则它会浮在菜单之上，既碍眼又可能被误点。
    document.documentElement.dataset.menuOpen = "true";
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      window.removeEventListener("keydown", onKeyDown);
      delete document.documentElement.dataset.menuOpen;
    };
  }, [menuVisible]);

  // 只有首页 hero 之上才允许出现「透明 + 白字」形态
  const overHero = isHome && !scrolled;

  return (
    <header
      // `data-over-hero` 是给 CSS 用来提高优先级的钩子，见 globals.css 的同名规则：
      // 组件类（.nav-link/.icon-button）自带 color，Tailwind 工具类压不过它们。
      data-over-hero={overHero ? "" : undefined}
      className={`sticky top-0 z-50 transition-colors duration-200 ${
        overHero
          ? "border-b border-transparent bg-transparent"
          : "border-b border-line bg-bg/85 backdrop-blur-md"
      }`}
    >
      {/*
        hero 之上加一层顶部压暗，保证浅色壁纸下站名与导航仍可读。
        强度按像素级实测调整（顶部 0.45 → 0.62、中段 0.18 → 0.42），文字颜色另见
        globals.css 的 `header[data-over-hero]` 规则。
        此前白色站名压在浅色壁纸上的实测对比度只有 1.64:1（要求 4.5:1）。
      */}
      {overHero && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(15,23,42,.62) 0%, rgba(15,23,42,.42) 60%, rgba(15,23,42,.16) 100%)",
          }}
        />
      )}
      <div className="relative mx-auto flex h-16 max-w-content items-center gap-3 px-5 sm:px-6">
        <Link
          href="/"
          aria-label={`${blogTitle} 主页`}
          className="flex min-w-0 items-center gap-2.5 font-bold tracking-tight"
        >
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-sm text-white shadow-sm ${
              overHero ? "bg-primary-solid ring-1 ring-white/30" : "bg-primary-solid"
            }`}
          >
            <KunFishIcon className="h-5 w-5" />
          </span>
          <span
            className={`hidden truncate text-base font-bold sm:block ${
              overHero ? "text-white [text-shadow:0_1px_6px_rgba(15,23,42,.85)]" : "text-ink"
            }`}
          >
            {blogTitle}
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`nav-link ${overHero ? "text-white/85 hover:bg-white/15 hover:text-white" : ""} ${
                  overHero && active ? "bg-white/20 text-white" : ""
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={`ml-auto flex items-center gap-0.5 ${overHero ? "text-white" : ""}`}>
          <Link href="/articles" className="icon-button" aria-label="搜索文章" title="搜索文章">
            <SearchIcon className="h-[18px] w-[18px]" />
          </Link>
          {/* 播放器面板定位依赖这个 relative 容器；重写 Header 时曾漏掉 LazyMusicPlayer，
              导致音乐按钮只能切换图标、打不开面板。 */}
          <div className="relative">
            <MusicToggle />
            <LazyMusicPlayer />
          </div>
          <ThemeSelector />
          <div className="ml-1 hidden border-l border-line pl-2 lg:block">
            <AuthNav />
          </div>
          <button
            type="button"
            className="icon-button lg:hidden"
            aria-label={menuVisible ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuVisible}
            aria-controls={MENU_ID}
            onClick={toggleMenu}
          >
            {menuVisible ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* 遮罩：点菜单以外的区域关闭。放在菜单之前，z-index 低于菜单本身。 */}
      {menuVisible && (
        <button
          type="button"
          aria-label="关闭菜单"
          tabIndex={-1}
          data-print="hide"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 top-16 z-40 cursor-default bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {menuVisible && (
        <nav
          id={MENU_ID}
          aria-label="移动端菜单"
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100svh-4rem)] overflow-y-auto border-b border-line bg-bg px-5 pb-4 pt-2 shadow-float lg:hidden"
        >
          <ul className="grid">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center justify-between rounded-sm px-3 py-3 text-ui ${
                      active ? "bg-primary-soft font-semibold text-primary-deep" : "text-ink-2"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-line px-3 pt-3">
            <AuthNav />
          </div>
        </nav>
      )}
    </header>
  );
}
