import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getCategoryArchivePageData } from "@/lib/api/public-api";
import { pageAlternates } from "@/lib/metadata";

const PAGE_SIZE = 10;

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category: categorySlug } = await params;
  const { category } = await getCategoryArchivePageData(categorySlug, 1, 1);
  if (!category) return { title: "分类不存在" };

  return {
    title: `${category.name} 分类`,
    description: `浏览 ${category.name} 分类下的博客文章`,
    alternates: pageAlternates(`/categories/${category.slug}`),
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ category: categorySlug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const { category, articles } = await getCategoryArchivePageData(
    categorySlug,
    page,
    PAGE_SIZE
  );

  if (!category) notFound();

  return (
    <PageShell>
      <PageHeader
        kicker="Category"
        title={category.name}
        description={`${category.name} 分类下的全部文章。`}
        meta={`共 ${articles.total} 篇`}
      />
      <ArticleList articles={articles.items} />
      <Pagination currentPage={page} totalPages={articles.totalPages} />
    </PageShell>
  );
}
