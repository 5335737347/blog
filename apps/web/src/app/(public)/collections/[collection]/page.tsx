import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getCollectionPageData } from "@/lib/api/public-api";
import { pageAlternates } from "@/lib/metadata";

const PAGE_SIZE = 10;

interface CollectionPageProps {
  params: Promise<{ collection: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: CollectionPageProps): Promise<Metadata> {
  const { collection: projectSlug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const { project } = await getCollectionPageData(projectSlug, 1, 1);
  if (!project) return { title: "项目不存在" };

  return {
    title: `项目：${project.name}`,
    description: project.description || `浏览项目「${project.name}」下的全部文章`,
    alternates: pageAlternates(`/collections/${project.slug}`, page > 1 ? `page=${page}` : undefined),
  };
}

export default async function CollectionPage({ params, searchParams }: CollectionPageProps) {
  const [{ collection: projectSlug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const { project, articles } = await getCollectionPageData(projectSlug, page, PAGE_SIZE);

  if (!project) notFound();

  return (
    <PageShell>
      <PageHeader
        kicker="Project"
        title={project.name}
        description={project.description || `项目「${project.name}」下的全部文章。`}
        meta={`共 ${articles.total} 篇`}
      />
      <ArticleList articles={articles.items} />
      <Pagination currentPage={page} totalPages={articles.totalPages} />
    </PageShell>
  );
}
