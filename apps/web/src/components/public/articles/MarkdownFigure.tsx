"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, ExpandIcon } from "@/components/public/layout/SiteIcons";

interface MarkdownFigureProps {
  src: string;
  alt?: string;
}

/**
 * 正文图片：默认带图注，点击进入 lightbox（点遮罩或按 ESC 关闭）。
 */
export default function MarkdownFigure({ src, alt = "" }: MarkdownFigureProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // 关闭后把焦点还给触发图片的按钮，键盘用户不会掉回页面开头。
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      // 对话框里只有关闭按钮可交互，Tab 保持在其中，避免焦点跑到背景页面。
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  return (
    <>
      <figure className="markdown-image-frame">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-line"
          aria-label={alt ? `放大图片：${alt}` : "放大图片"}
        >
          {/* 正文图片来自用户内容，尺寸未知，保持原生 img 以避免布局约束 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} loading="lazy" decoding="async" className="w-full" />
          {/* 常驻的放大提示：只在 hover 显示的话，触屏设备上就没有任何可点击的线索 */}
          <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-sm bg-black/45 text-white opacity-80 transition-opacity group-hover:opacity-100">
            <ExpandIcon className="h-4 w-4" />
          </span>
        </button>
        {alt && <figcaption>{alt}</figcaption>}
      </figure>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt || "图片预览"}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
          onClick={close}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-h-[90svh] max-w-full rounded-md object-contain"
          />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="关闭预览"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-sm bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
