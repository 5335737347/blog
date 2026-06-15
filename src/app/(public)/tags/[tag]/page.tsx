import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ArticleList from "@/components/public/ArticleList";
import Pagination from "@/components/public/Pagination";
import PublicLayout from "@/components/public/PublicLayout";

const PAGE_SIZE = 10;

interface TagPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const [{ tag: tagSlug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ]);
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const tag = await prisma.tag.findUnique({
    where: { slug: tagSlug },
  });

  if (!tag) notFound();

  const [articles, total] = await Promise.all([
    prisma.post.findMany({
      where: {
        published: true,
        tags: { some: { tagId: tag.id } },
      },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        coverImage: true,
        category: { select: { name: true, slug: true } },
        tags: {
          select: {
            tag: { select: { name: true, slug: true } },
          },
        },
      },
    }),
    prisma.post.count({
      where: {
        published: true,
        tags: { some: { tagId: tag.id } },
      },
    }),
  ]);

  const articlesWithTags = articles.map((a) => ({
    ...a,
    coverImage: a.coverImage ?? null,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    tags: a.tags.map((t) => t.tag),
  }));

  return (
    <PublicLayout>
      <h1 className="mb-2 text-3xl font-bold text-purple-950 dark:text-purple-50">
        #{tag.name}
      </h1>
      <p className="mb-8 text-sm text-purple-400 dark:text-purple-500">
        共 {total} 篇文章
      </p>
      <ArticleList articles={articlesWithTags} />
      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / PAGE_SIZE)}
      />
    </PublicLayout>
  );
}
