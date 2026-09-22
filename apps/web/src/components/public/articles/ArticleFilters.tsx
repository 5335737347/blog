"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";

interface ArticleFiltersProps {
  categories: { name: string; slug: string; postCount: number }[];
  tags: { name: string; slug: string; postCount: number }[];
}

/**
 * 文章列表页的分类/标签下拉筛选。
 * 与搜索框同一模式：写入 URL（?category= ?tag=）由服务端过滤，分页链接
 * 基于 searchParams 构建所以筛选会自动跟随分页。数据为空时整体隐藏。
 */
export default function ArticleFilters({ categories, tags }: ArticleFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";

  const hrefFor = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    return qs ? `/articles?${qs}` : "/articles";
  };

  if (categories.length === 0 && tags.length === 0) return null;

  const selectClass =
    "h-9 rounded-sm border border-line bg-surface px-2.5 text-meta text-ink outline-none transition-colors focus:border-accent";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {categories.length > 0 && (
        <select
          aria-label="按分类筛选"
          value={category}
          onChange={(e) => router.push(hrefFor({ category: e.target.value || null }))}
          className={selectClass}
        >
          <option value="">全部分类</option>
          {categories.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}（{item.postCount}）
            </option>
          ))}
        </select>
      )}
      {tags.length > 0 && (
        <select
          aria-label="按标签筛选"
          value={tag}
          onChange={(e) => router.push(hrefFor({ tag: e.target.value || null }))}
          className={selectClass}
        >
          <option value="">全部标签</option>
          {tags.map((item) => (
            <option key={item.slug} value={item.slug}>
              #{item.name}（{item.postCount}）
            </option>
          ))}
        </select>
      )}
      {(category || tag) && (
        <button
          type="button"
          onClick={() => router.push(hrefFor({ category: null, tag: null }))}
          className="rounded-sm px-2 py-1.5 text-meta text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink"
        >
          清除筛选 ×
        </button>
      )}
    </div>
  );
}
