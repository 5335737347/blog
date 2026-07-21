"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AuthNav from "@/components/public/auth/AuthNav";
import { ArticleIcon, GalleryIcon, MessageIcon, ProfileIcon } from "./SiteIcons";

const links = [
  { href: "/articles", label: "文章", icon: ArticleIcon },
  { href: "/about", label: "个人介绍", icon: ProfileIcon },
  { href: "/messages", label: "留言", icon: MessageIcon },
  { href: "/gallery", label: "相册", icon: GalleryIcon },
];

export default function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="xl:hidden">
      <button
        type="button"
        className="icon-button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          {open ? <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /> : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav id="mobile-navigation" aria-label="移动端主导航" className="surface-panel absolute inset-x-4 top-[calc(100%+0.5rem)] grid gap-1 p-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-[--muted] transition-colors hover:bg-pink-50 hover:text-[--foreground] dark:hover:bg-purple-900/30"
              >
                <Icon className="h-5 w-5" />
                {link.label}
              </Link>
            );
          })}
          <div className="border-t border-pink-100 px-3 py-3 dark:border-purple-800/40">
            <AuthNav />
          </div>
        </nav>
      )}
    </div>
  );
}
