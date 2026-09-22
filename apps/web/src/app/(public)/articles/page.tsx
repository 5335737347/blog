import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import ArticleFilters from "@/components/public/articles/ArticleFilters";
import ArticleSearch from "@/components/public/articles/ArticleSearch";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getArticleIndexPageData, getPublicCategories, getPublicTags } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { pageAlternates } from "@/lib/metadata";

const PAGE_SIZE = 10;

interface ArticleIndexPageProps {
  searchParams: Promise<{ page?: string; q?: string; category?: string; tag?: string }>;
}

export async function generateMetadata({
  searchParams,
}: ArticleIndexPageProps): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const url = siteUrl ? `${siteUrl}/articles` : undefined;
  const { q, category, tag, page: pageParam } = await searchParams;
  const query = q?.trim() || "";
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);

  if (query || category || tag) {
    // 搜索/筛选结果页有无限个 URL 形态,不允许索引,但允许顺着结果继续抓取。
    // 只有分类/标签筛选（无关键词）时用真实名称做标题，避免「」空引号。
    let filterLabel = "";
    if (!query) {
      const [categories, tags] = await Promise.all([getPublicCategories(), getPublicTags()]);
      const categoryName = categories.find((item) => item.slug === category)?.name;
      const tagName = tags.find((item) => item.slug === tag)?.name;
      if (categoryName && tagName) filterLabel = `${categoryName} · #${tagName} `;
      else if (categoryName) filterLabel = `「${categoryName}」分类 `;
      else if (tagName) filterLabel = `#${tagName} 标签 `;
    }
    return {
      title: query ? `「${query}」的搜索结果` : `${filterLabel}筛选结果`,
      robots: { index: false, follow: true },
    };
  }

  return {
    title: "文章",
    description: "浏览全部博客文章",
    alternates: pageAlternates("/articles", page > 1 ? `page=${page}` : undefined),
    openGraph: {
      title: "文章",
      description: "浏览全部博客文章",
      type: "website",
      url,
    },
  };
}

export default async function ArticleIndexPage({ searchParams }: ArticleIndexPageProps) {
  const { page: pageParam, q: qParam, category: categoryParam, tag: tagParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const query = qParam?.trim() || "";
  const category = categoryParam?.trim() || "";
  const tag = tagParam?.trim() || "";
  const [articles, categories, tags] = await Promise.all([
    getArticleIndexPageData(page, PAGE_SIZE, query || undefined, {
      category: category || undefined,
      tag: tag || undefined,
    }),
    getPublicCategories(),
    getPublicTags(),
  ]);
  const activeCategory = categories.find((item) => item.slug === category);
  const activeTag = tags.find((item) => item.slug === tag);

  return (
    <PageShell>
      <PageHeader
        kicker="All writing"
        title="文章"
        description="持续记录技术实践、学习过程与生活观察。"
        meta={
          query
            ? `找到 ${articles.total} 篇与「${query}」相关`
            : activeCategory || activeTag
              ? `筛选出 ${articles.total} 篇`
              : articles.total > 0
                ? `共 ${articles.total} 篇`
                : undefined
        }
      />
      <ArticleSearch initialQuery={query} />
      <ArticleFilters categories={categories} tags={tags} />
      {(query || category || tag) && articles.total === 0 ? (
        <div className="empty-state mt-10">
          没有符合条件的文章,换个关键词或清除筛选试试。
        </div>
      ) : (
        <>
          <ArticleList articles={articles.items} />
          <Pagination currentPage={page} totalPages={articles.totalPages} />
        </>
      )}
    </PageShell>
  );
}
