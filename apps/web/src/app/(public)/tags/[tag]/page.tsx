import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getTagArchivePageData } from "@/lib/api/public-api";
import { pageAlternates } from "@/lib/metadata";
import { parsePageParam } from "@/lib/utils";

const PAGE_SIZE = 10;

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: TagPageProps): Promise<Metadata> {
  const { tag: tagSlug } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);
  const { tag } = await getTagArchivePageData(tagSlug, 1, 1);
  if (!tag) return { title: "标签不存在" };

  return {
    title: `#${tag.name}`,
    description: `浏览带有 ${tag.name} 标签的博客文章`,
    alternates: pageAlternates(`/tags/${tag.slug}`, page > 1 ? `page=${page}` : undefined),
  };
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const [{ tag: tagSlug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = parsePageParam(pageParam);

  const { tag, articles } = await getTagArchivePageData(tagSlug, page, PAGE_SIZE);

  if (!tag) notFound();

  return (
    <PageShell>
      <PageHeader
        kicker="Tag"
        title={`#${tag.name}`}
        description={`带有「${tag.name}」标签的全部文章。`}
        meta={`共 ${articles.total} 篇`}
      />
      <ArticleList articles={articles.items} />
      <Pagination currentPage={page} totalPages={articles.totalPages} />
    </PageShell>
  );
}
