"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readApiData } from "@/lib/api-client";
import { SearchIcon } from "@/components/public/layout/SiteIcons";

interface HeaderSearchProps {
  /** 收起搜索框(Esc / 点击头部以外区域时由 Header 调用) */
  onClose: () => void;
  /** 首页 hero 之上:跟随头部的暗色压暗形态,输入框切换为玻璃白字 */
  overHero?: boolean;
}

interface SearchResult {
  slug: string;
  title: string;
  excerpt: string | null;
}

/**
 * 头部原位搜索:点放大镜后,头部的中间区域变成搜索输入框。
 *
 * - 输入(防抖 200ms)→ 下方弹出实时结果,点击直达文章;
 * - 回车 → 跳到 /articles?q=… 结果页(与列表页搜索框同一套参数);
 * - Esc / 点击头部以外区域 → 收起(收起逻辑由 Header 持有状态统一处理)。
 * 外层弹性容器占据头部中段并让输入框(max-w-xl)在其中居中,
 * 导航在搜索展开期间让位隐藏——空间与注意力都留给搜索。
 */
export default function HeaderSearch({ onClose, overHero = false }: HeaderSearchProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    const keyword = query.trim();
    const controller = new AbortController();
    // 清空与请求都放进防抖回调:setState 同步发生在 effect 里会触发
    // react-hooks/set-state-in-effect 红线(级联渲染风险)。
    const timer = window.setTimeout(async () => {
      if (keyword.length < 2) {
        setResults([]);
        return;
      }
      try {
        const response = await fetch(`/api/articles?limit=8&q=${encodeURIComponent(keyword)}`, {
          signal: controller.signal,
        });
        const data = await readApiData<{ items: SearchResult[] }>(response);
        setResults(data.items);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults([]);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const goToResults = (event?: FormEvent) => {
    event?.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    onClose();
    router.push(`/articles?q=${encodeURIComponent(keyword)}`);
  };

  const showResults = query.trim().length >= 2;

  return (
    <div className="relative ml-4 hidden min-w-0 flex-1 justify-center sm:flex">
      <form
        id="header-search"
        ref={containerRef}
        role="search"
        onSubmit={goToResults}
        className={`relative flex h-10 w-full max-w-xl items-center gap-2.5 rounded-full border px-4 transition-colors focus-within:border-accent/60 ${
          overHero
            ? "border-white/40 bg-white/10 backdrop-blur-sm focus-within:border-white/70"
            : "border-line bg-surface focus-within:border-accent/60"
        }`}
      >
        <SearchIcon className={`h-4 w-4 shrink-0 ${overHero ? "text-white/70" : "text-ink-3"}`} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="搜索文章"
          aria-expanded={showResults}
          aria-controls="header-search-results"
          aria-autocomplete="list"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索文章、技术与生活记录…"
          className={`min-w-0 flex-1 bg-transparent text-ui outline-none ${
            overHero ? "text-white placeholder:text-white/65" : "text-ink placeholder:text-ink-4"
          }`}
        />

        {showResults && (
          <div
            id="header-search-results"
            role="listbox"
            data-print="hide"
            className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-md border border-line bg-surface p-1.5 shadow-float"
          >
            {results.length > 0 ? (
              <>
                {results.map((result) => (
                  <Link
                    key={result.slug}
                    href={`/articles/${result.slug}`}
                    role="option"
                    aria-selected="false"
                    onClick={onClose}
                    className="block rounded-sm px-3 py-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="block truncate text-ui font-semibold text-ink">{result.title}</span>
                    {result.excerpt && (
                      <span className="mt-0.5 block truncate text-meta text-ink-3">{result.excerpt}</span>
                    )}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={goToResults}
                  className="mt-1 block w-full rounded-sm border-t border-line px-3 pt-2.5 pb-1 text-center text-meta text-ink-3 transition-colors hover:text-primary-deep"
                >
                  查看全部结果
                </button>
              </>
            ) : (
              <p className="px-3 py-4 text-center text-meta text-ink-3">没有找到相关文章。</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
