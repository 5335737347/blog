import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { getTagArchivePageData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";

const PAGE_SIZE = 10;

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { tag: tagSlug } = await params;
  const { tag } = await getTagArchivePageData(tagSlug, 1, 1);
  if (!tag) return { title: "标签不存在" };

  return {
    title: `#${tag.name}`,
    description: `浏览带有 ${tag.name} 标签的博客文章`,
    alternates: {
      canonical: getSiteUrl() ? `${getSiteUrl()}/tags/${tag.slug}` : undefined,
    },
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const [{ tag: tagSlug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const { tag, articles } = await getTagArchivePageData(tagSlug, page, PAGE_SIZE);

  if (!tag) notFound();

  return (
    <ContentLayout>
      <h1 className="mb-2 text-3xl font-bold text-purple-950 dark:text-purple-50">
        #{tag.name}
      </h1>
      <p className="mb-8 text-sm text-purple-400 dark:text-purple-500">
        共 {articles.total} 篇文章
      </p>
      <ArticleList articles={articles.items} />
      <Pagination
        currentPage={page}
        totalPages={articles.totalPages}
      />
    </ContentLayout>
  );
}
