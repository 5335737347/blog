"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AdminNav from "./AdminNav";

/**
 * 后台骨架。
 *
 * 桌面端（lg+）是固定左侧栏；窄屏改为顶栏 + 抽屉——此前的 w-52 固定侧栏
 * 在手机上会挤压内容区。抽屉打开时锁定页面滚动，Escape、点击遮罩或
 * 路由变化都会收起。登录页不套任何骨架。
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // 路由变化时收起抽屉。渲染期间比较并重置（React 官方推荐的
  // adjust-state-during-render 模式）：effect 里同步 setState 会触发
  // react-hooks/set-state-in-effect。
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (pathname === "/admin/login") {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-bg-subtle">
      {/* 窄屏顶栏 */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="admin-drawer"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          onClick={() => setMenuOpen((open) => !open)}
          className="icon-button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <Link href="/admin" className="text-ui font-semibold text-ink">
          管理后台
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-content">
        {/* 桌面侧栏 */}
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <Link
            href="/admin"
            className="block px-5 pb-2 pt-5 text-ui font-semibold text-ink"
          >
            管理后台
          </Link>
          <AdminNav />
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>

      {/* 窄屏抽屉 */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="管理菜单">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div id="admin-drawer" className="absolute inset-y-0 left-0 flex w-60 flex-col bg-surface shadow-float">
            <div className="flex h-14 items-center border-b border-line px-5 text-ui font-semibold text-ink">
              管理后台
            </div>
            <AdminNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
