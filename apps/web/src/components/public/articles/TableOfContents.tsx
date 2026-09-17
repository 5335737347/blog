"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, ListIcon } from "@/components/public/layout/SiteIcons";

export interface TocHeading {
  id: string;
  text: string;
  level: number;
}

/** 滚动联动：高亮当前小节 */
function useActiveHeading(ids: string[]) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      // 头部 88px + 余量，保证标题刚进入视口就算当前小节
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function TocList({
  headings,
  activeId,
  onNavigate,
}: {
  headings: TocHeading[];
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid gap-0.5">
      {headings.map((heading) => {
        const on = heading.id === activeId;
        return (
          <li key={heading.id} style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}>
            <a
              href={`#${heading.id}`}
              onClick={onNavigate}
              aria-current={on ? "location" : undefined}
              className={`block truncate rounded-xs border-l-2 py-1.5 pl-2.5 pr-2 text-meta transition-colors ${
                on
                  ? "border-primary font-medium text-primary-deep"
                  : "border-transparent text-ink-3 hover:border-line-strong hover:text-ink-2"
              }`}
            >
              {heading.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 目录：
 * - lg 以上：正文左侧粘性栏，超过视口高度时内部滚动。
 * - lg 以下：右下角浮动按钮打开的底部抽屉。
 */
export default function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const ids = headings.map((h) => h.id);
  const activeId = useActiveHeading(ids);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (headings.length < 2) return null;

  return (
    <>
      {/* 桌面：粘性侧栏 */}
      <nav aria-label="文章目录" data-print="hide" className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100svh-8rem)] overflow-y-auto pr-1">
          <p className="mb-2.5 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-wide text-ink-3">
            <ListIcon className="h-3.5 w-3.5" />
            目录
          </p>
          <TocList headings={headings} activeId={activeId} />
        </div>
      </nav>

      {/* 移动：浮动按钮 + 抽屉 */}
      <div data-print="hide" className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="toc-drawer"
          className="fixed bottom-20 right-4 z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-meta font-medium text-ink-2 shadow-float"
        >
          <ListIcon className="h-4 w-4" />
          目录
        </button>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
            <button
              type="button"
              aria-label="关闭目录"
              className="absolute inset-0 bg-black/40"
              onClick={close}
            />
            <div
              id="toc-drawer"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="文章目录"
              className="absolute inset-x-0 bottom-0 max-h-[70svh] overflow-y-auto rounded-t-lg border-t border-line bg-surface px-5 pb-8 pt-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-ui font-semibold text-ink">目录</p>
                <button type="button" onClick={close} className="icon-button" aria-label="关闭">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <TocList headings={headings} activeId={activeId} onNavigate={close} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
