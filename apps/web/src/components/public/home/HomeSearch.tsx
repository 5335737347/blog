"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { readApiData } from "@/lib/api-client";

interface SearchResult {
  slug: string;
  title: string;
  excerpt: string | null;
}

const SEARCH_HINTS = [
  { label: "搜索文章、技术与生活记录…", icon: "search" },
  { label: "今天想读点什么？", icon: "book" },
  { label: "输入关键词，寻找一份灵感…", icon: "sparkle" },
] as const;

function SearchHintIcon({ name }: { name: (typeof SEARCH_HINTS)[number]["icon"] }) {
  if (name === "book") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.5c3.2-.8 5.7-.2 7.5 1.7v12c-1.8-1.9-4.3-2.5-7.5-1.7zM19.5 5.5c-3.2-.8-5.7-.2-7.5 1.7v12c1.8-1.9 4.3-2.5 7.5-1.7z" /></svg>;
  }
  if (name === "sparkle") {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5c.7 4.7 3.3 7.3 8 8-4.7.7-7.3 3.3-8 8-.7-4.7-3.3-7.3-8-8 4.7-.7 7.3-3.3 8-8Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-5 w-5"><circle cx="10.75" cy="10.75" r="6.25" /><path strokeLinecap="round" d="m15.5 15.5 4 4" /></svg>;
}

export default function HomeSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHintIndex((index) => (index + 1) % SEARCH_HINTS.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
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

  const hint = SEARCH_HINTS[hintIndex];
  const visibleResults = query.trim().length >= 2 ? results : [];

  return (
    <div ref={containerRef} className="relative mx-auto mt-8 w-full max-w-3xl text-left">
      <div className="group flex h-14 items-center rounded-full border border-white/75 bg-white/90 px-5 shadow-[0_18px_50px_-22px_rgba(15,23,42,0.9)] backdrop-blur-xl transition focus-within:border-sky-300 focus-within:bg-white sm:h-16 sm:px-6">
        <span key={hint.icon} className="mr-3 text-sky-500 [animation:search-icon-in_.35s_ease-out] sm:mr-4">
          <SearchHintIcon name={hint.icon} />
        </span>
        <input
          type="search"
          role="combobox"
          aria-label="搜索文章"
          aria-expanded={open && query.trim().length >= 2}
          aria-controls="home-search-results"
          aria-autocomplete="list"
          value={query}
          placeholder={hint.label}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-800 outline-none placeholder:text-slate-400 sm:text-lg"
        />
        <span className="ml-3 hidden rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400 sm:block">ENTER</span>
      </div>

      {open && query.trim().length >= 2 && (
        <div id="home-search-results" role="listbox" className="absolute inset-x-0 top-full z-30 mt-3 max-h-80 overflow-y-auto rounded-3xl border border-white/80 bg-white/95 p-2 shadow-2xl backdrop-blur-2xl">
          {visibleResults.length > 0 ? visibleResults.map((result) => (
            <Link
              key={result.slug}
              href={`/articles/${result.slug}`}
              role="option"
              aria-selected="false"
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 text-slate-700 transition hover:bg-[linear-gradient(90deg,#fff1f5,#eff8ff)]"
            >
              <span className="block truncate text-sm font-bold">{result.title}</span>
              {result.excerpt && <span className="mt-1 block truncate text-xs text-slate-500">{result.excerpt}</span>}
            </Link>
          )) : (
            <p className="px-4 py-6 text-center text-sm text-slate-500">没有找到相关文章</p>
          )}
        </div>
      )}
    </div>
  );
}
