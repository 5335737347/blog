import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getArticleIndexPageData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { pageAlternates } from "@/lib/metadata";

const PAGE_SIZE = 10;

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const url = siteUrl ? `${siteUrl}/articles` : undefined;
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

interface ArticleIndexPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ArticleIndexPage({ searchParams }: ArticleIndexPageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const articles = await getArticleIndexPageData(page, PAGE_SIZE);

  return (
    <PageShell>
      <PageHeader
        kicker="All writing"
        title="文章"
        description="持续记录技术实践、学习过程与生活观察。"
        meta={articles.total > 0 ? `共 ${articles.total} 篇` : undefined}
      />
      <ArticleList articles={articles.items} />
      <Pagination currentPage={page} totalPages={articles.totalPages} />
    </PageShell>
  );
}
