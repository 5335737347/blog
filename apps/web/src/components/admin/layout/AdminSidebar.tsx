"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { readApiData } from "@/lib/api-client";

const links = [
  { href: "/admin", label: "文章管理", exact: true },
  { href: "/admin/articles/new", label: "新建文章" },
  { href: "/admin/comments", label: "评论审核" },
  { href: "/admin/import", label: "导入笔记" },
  { href: "/admin/music", label: "音乐管理" },
  { href: "/admin/settings", label: "博客设置" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) =>
        res.ok ? readApiData<{ authenticated: boolean; username: string }>(res) : null
      )
      .then((data) => data && setUsername(data.username))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 网络失败时仍然跳回登录页，避免按钮看起来毫无反应。
    }
    router.push("/admin/login");
  };

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-purple-200 bg-purple-50/50 dark:border-purple-800/40 dark:bg-purple-900/20">
      <div className="p-4">
        <div className="mb-1 px-2 text-xs font-medium text-purple-500 dark:text-purple-400">
          {username ? username : "管理菜单"}
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {links.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sky-50 font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                  : "text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-800/30"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-purple-200 p-3 dark:border-purple-800/40">
        <Link
          href="/"
          className="block rounded-md px-3 py-2 text-sm text-purple-500 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-800/30 transition-colors"
        >
          回到前台
        </Link>
        <button
          onClick={handleLogout}
          className="mt-1 w-full rounded-md px-3 py-2 text-left text-sm text-purple-500 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-800/30 transition-colors"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
