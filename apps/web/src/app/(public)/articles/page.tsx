import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import ArticleSearch from "@/components/public/articles/ArticleSearch";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getArticleIndexPageData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { pageAlternates } from "@/lib/metadata";

const PAGE_SIZE = 10;

interface ArticleIndexPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export async function generateMetadata({
  searchParams,
}: ArticleIndexPageProps): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const url = siteUrl ? `${siteUrl}/articles` : undefined;
  const { q } = await searchParams;
  const query = q?.trim() || "";

  if (query) {
    // 搜索结果页有无限个 URL 形态,不允许索引,但允许顺着结果继续抓取
    return {
      title: `「${query}」的搜索结果`,
      robots: { index: false, follow: true },
    };
  }

  return {
    title: "文章",
    description: "浏览全部博客文章",
    alternates: pageAlternates("/articles"),
    openGraph: {
      title: "文章",
      description: "浏览全部博客文章",
      type: "website",
      url,
    },
  };
}

export default async function ArticleIndexPage({ searchParams }: ArticleIndexPageProps) {
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const query = qParam?.trim() || "";
  const articles = await getArticleIndexPageData(page, PAGE_SIZE, query || undefined);

  return (
    <PageShell>
      <PageHeader
        kicker="All writing"
        title="文章"
        description="持续记录技术实践、学习过程与生活观察。"
        meta={
          query
            ? `找到 ${articles.total} 篇与「${query}」相关`
            : articles.total > 0
              ? `共 ${articles.total} 篇`
              : undefined
        }
      />
      <ArticleSearch initialQuery={query} />
      {query && articles.total === 0 ? (
        <div className="empty-state mt-10">
          没有找到与「{query}」相关的文章,换个关键词试试。
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
