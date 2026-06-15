"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/admin", label: "📝 文章管理", exact: true },
  { href: "/admin/articles/new", label: "✨ 新建文章" },
  { href: "/admin/images", label: "🖼️ 图片管理" },
  { href: "/admin/music", label: "🎵 音乐管理" },
  { href: "/admin/settings", label: "⚙️ 博客设置" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsername(data.username))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-pink-100 bg-pink-50/30 dark:border-purple-800/30 dark:bg-purple-950/30">
      <div className="p-4">
        <div className="mb-1 px-2 text-xs font-medium text-pink-400 dark:text-purple-400">
          {username ? `👤 ${username}` : "🌸 管理菜单"}
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
              className={`rounded-xl px-3 py-2 text-sm transition-all ${
                active
                  ? "bg-gradient-to-r from-pink-100 to-purple-100 text-purple-700 font-medium dark:from-pink-900/30 dark:to-purple-900/30 dark:text-purple-200"
                  : "text-purple-500 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-pink-100 p-3 dark:border-purple-800/30">
        <Link
          href="/"
          className="block rounded-xl px-3 py-2 text-sm text-purple-400 hover:bg-pink-50 dark:text-purple-500 dark:hover:bg-purple-900/20 transition-colors"
        >
          ← 回到前台
        </Link>
        <button
          onClick={handleLogout}
          className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm text-purple-400 hover:bg-pink-50 dark:text-purple-500 dark:hover:bg-purple-900/20 transition-colors"
        >
          登出
        </button>
      </div>
    </aside>
  );
}
