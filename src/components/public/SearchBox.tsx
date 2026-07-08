"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { readApiData } from "@/lib/api-client";

interface Result {
  slug: string;
  title: string;
  excerpt: string | null;
}

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/articles?limit=50`);
      const data = await readApiData<{ items: Result[] }>(res);
      const q = query.toLowerCase();
      const filtered = data.items.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.excerpt || "").toLowerCase().includes(q)
      );
      setResults(filtered.slice(0, 8));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const visibleResults = query.length < 2 ? [] : results;

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder="🔍 搜索文章..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-pink-200 bg-white px-3 py-2 text-sm text-purple-900 placeholder-pink-300 focus:border-purple-400 focus:outline-none dark:border-purple-800 dark:bg-purple-950 dark:text-purple-100 dark:placeholder-purple-600"
      />
      {open && visibleResults.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border-2 border-pink-200 bg-white shadow-lg dark:border-purple-800 dark:bg-purple-950">
          {visibleResults.map((r) => (
            <Link
              key={r.slug}
              href={`/articles/${r.slug}`}
              onClick={() => setOpen(false)}
              className="block border-b border-pink-50 px-3 py-2 text-sm text-purple-700 hover:bg-pink-50 dark:border-purple-900 dark:text-purple-300 dark:hover:bg-purple-900/30 last:border-0"
            >
              <span className="font-medium">{r.title}</span>
              {r.excerpt && (
                <span className="ml-2 text-xs text-purple-400">— {r.excerpt.slice(0, 40)}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
