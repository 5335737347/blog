"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpIcon } from "./SiteIcons";

export default function BackToTop() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 文章页右下角已经有目录抽屉按钮，回到顶部上移一层避免重叠。
  const isArticlePage = /^\/articles\/[^/]+$/.test(pathname);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="回到顶部"
      data-print="hide"
      className={`fixed right-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-float transition-all duration-200 hover:text-primary-deep lg:right-6 lg:h-11 lg:w-11 ${
        isArticlePage ? "bottom-36 lg:bottom-6" : "bottom-20 lg:bottom-6"
      } ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-12 opacity-0"
      }`}
    >
      <ArrowUpIcon className="h-4 w-4" />
    </button>
  );
}
