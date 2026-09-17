"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { readApiData } from "@/lib/api-client";
import { SearchIcon } from "@/components/public/layout/SiteIcons";

interface SearchResult {
  slug: string;
  title: string;
  excerpt: string | null;
}

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (q.length < 2) return text;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="rounded-xs bg-primary-soft px-0.5 text-primary-deep">{part}</mark>
      : part
  );
}

const PLACEHOLDER = "搜索文章、技术与生活记录…";

/**
 * 首页搜索：默认是 hero 上的玻璃输入框，聚焦后弹出结果面板。
 */
export default function HomeSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/articles?limit=8&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
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

  useEffect(() => {
    const closeOnClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnClickOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnClickOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && results[0]) {
      router.push(`/articles/${results[0].slug}`);
      setOpen(false);
    }
  };

  const showResults = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="glass flex h-11 items-center rounded-sm px-3.5 transition-colors focus-within:border-white/60">
        <SearchIcon className="mr-2.5 h-4 w-4 shrink-0 text-white/70" />
        <input
          type="search"
          role="combobox"
          aria-label="搜索文章"
          aria-expanded={showResults}
          aria-controls="home-search-results"
          aria-autocomplete="list"
          value={query}
          placeholder={PLACEHOLDER}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-ui text-white outline-none placeholder:text-white/65"
        />
        <kbd className="ml-2 hidden rounded-xs border border-white/25 px-1.5 py-0.5 text-xs font-medium text-white/70 sm:block">
          Enter
        </kbd>
      </div>

      {showResults && (
        <div
          id="home-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-md border border-line bg-surface p-1.5 shadow-float"
        >
          {results.length > 0 ? (
            results.map((result) => (
              <Link
                key={result.slug}
                href={`/articles/${result.slug}`}
                role="option"
                aria-selected="false"
                onClick={() => setOpen(false)}
                className="block rounded-sm px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <span className="block truncate text-ui font-semibold text-ink">
                  {highlightMatch(result.title, query)}
                </span>
                {result.excerpt && (
                  <span className="mt-0.5 block truncate text-meta text-ink-3">
                    {highlightMatch(result.excerpt.slice(0, 80), query)}
                  </span>
                )}
              </Link>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-meta text-ink-3">没有找到相关文章</p>
          )}
        </div>
      )}
    </div>
  );
}
