"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const groups: { title: string; links: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    title: "内容",
    links: [
      { href: "/admin", label: "文章管理", exact: true },
      { href: "/admin/articles/new", label: "新建文章" },
      { href: "/admin/comments", label: "评论审核" },
      { href: "/admin/import", label: "导入笔记" },
    ],
  },
  {
    title: "站点",
    links: [
      { href: "/admin/categories", label: "分类管理" },
      { href: "/admin/tags", label: "标签管理" },
      { href: "/admin/music", label: "音乐管理" },
      { href: "/admin/settings", label: "博客设置" },
    ],
  },
];

/**
 * 后台导航：桌面端在左侧栏、窄屏在抽屉里复用同一份内容。
 * `onNavigate` 供抽屉在点击后收起使用；桌面侧栏传空即可。
 */
export default function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 网络失败时仍然跳回登录页，避免按钮看起来毫无反应。
    }
    onNavigate?.();
    router.push("/admin/login");
  };

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label="管理菜单">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 px-3 text-micro font-medium text-ink-4">{group.title}</p>
          <div className="flex flex-col gap-0.5">
            {group.links.map((link) => {
              const active = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-sm px-3 py-2 text-meta transition-colors ${
                    active
                      ? "bg-primary-soft font-medium text-primary-deep"
                      : "text-ink-2 hover:bg-surface-hover hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="rounded-sm px-3 py-2 text-meta text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
        >
          回到前台
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-sm px-3 py-2 text-left text-meta text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
        >
          登出
        </button>
      </div>
    </nav>
  );
}
