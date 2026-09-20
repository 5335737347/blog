"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "@/components/public/layout/SiteIcons";

interface ArticleSearchProps {
  /** 当前 URL 里的 q,作为受控初始值 */
  initialQuery?: string;
}

const DEBOUNCE_MS = 500;

/**
 * 文章列表页的搜索框。
 *
 * URL 驱动:输入(防抖)或回车都会把 `?q=` 写进地址栏,由服务端过滤列表——
 * 搜索结果因此有 URL、可分享、可后退;分页组件基于 searchParams 构建链接,
 * q 会自动跟随分页。外层是原生 GET 表单,禁用 JS 时回车也能以整页跳转兜底。
 * 更新用 replace(避免每个防抖片段都堆一条历史),回车用 push(可后退)。
 */
export default function ArticleSearch({ initialQuery = "" }: ArticleSearchProps) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const timer = useRef<number | null>(null);
  const lastPushed = useRef(initialQuery);

  useEffect(() => {
    const query = value.trim();
    if (query === lastPushed.current.trim()) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastPushed.current = query;
      router.replace(query ? `/articles?q=${encodeURIComponent(query)}` : "/articles");
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [value, router]);

  // 回车立即跳转并保留一条历史,便于后退回到搜索前
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (query === lastPushed.current.trim()) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    lastPushed.current = query;
    router.push(query ? `/articles?q=${encodeURIComponent(query)}` : "/articles");
  };

  const clear = () => {
    setValue("");
    lastPushed.current = "";
    router.replace("/articles");
  };

  return (
    <form
      action="/articles"
      method="get"
      role="search"
      onSubmit={submit}
      className="relative mt-6 flex max-w-md items-center"
    >
      <SearchIcon className="pointer-events-none absolute left-3.5 h-4.5 w-4.5 text-ink-3" />
      <input
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="搜索标题、摘要与正文…"
        aria-label="搜索文章"
        className="w-full rounded-sm border border-line bg-surface py-2.5 pl-10 pr-10 text-ui text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-accent"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="清除搜索"
          className="absolute right-2.5 grid h-6 w-6 place-items-center rounded-full bg-bg-subtle text-ink-3 transition-colors hover:bg-border hover:text-ink"
        >
          ×
        </button>
      )}
    </form>
  );
}
