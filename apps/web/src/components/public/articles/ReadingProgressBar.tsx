"use client";

import { useEffect, useState } from "react";

/**
 * 阅读进度条：固定在头部下方，指示正文滚动进度。
 * 只做一件事，不带渐变。
 */
export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div data-print="hide" className="fixed left-0 top-16 z-40 h-0.5 w-full" aria-hidden="true">
      <div
        className="h-full bg-primary transition-[width] duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
