"use client";

import { useEffect, useRef } from "react";
import CodeCopyButton from "./CodeCopyButton";

interface HtmlContentProps {
  html: string;
}

export default function HtmlContent({ html }: HtmlContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // External links → new tab
    el.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("http") && !href.includes(location.hostname)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });

    // Images → lazy loading + responsive
    el.querySelectorAll("img").forEach((img) => {
      if (!img.hasAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }
      img.style.maxWidth = "100%";
      img.style.height = "auto";
    });

    // Tables → horizontal scroll wrapper
    el.querySelectorAll("table").forEach((table) => {
      if (!table.parentElement?.classList.contains("table-wrapper")) {
        const wrapper = document.createElement("div");
        wrapper.className = "overflow-x-auto -mx-4 px-4";
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });
  }, [html]);

  return (
    <>
      <div
        ref={ref}
        className="prose max-w-none dark:prose-invert prose-headings:text-purple-950 dark:prose-headings:text-purple-100 prose-headings:font-bold prose-a:text-pink-500 dark:prose-a:text-pink-400 prose-a:no-underline hover:prose-a:text-purple-500 prose-code:before:content-none prose-code:after:content-none prose-code:rounded-lg prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-pink-600 dark:prose-code:bg-purple-900/40 dark:prose-code:text-pink-300 prose-pre:rounded-2xl prose-pre:bg-purple-950 dark:prose-pre:bg-purple-950 prose-pre:border prose-pre:border-purple-800 prose-img:rounded-2xl prose-blockquote:border-pink-400 prose-blockquote:bg-pink-50/50 dark:prose-blockquote:bg-purple-900/20 prose-blockquote:rounded-r-xl prose-table:rounded-2xl"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <CodeCopyButton />
    </>
  );
}
