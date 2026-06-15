import { prisma } from "@/lib/prisma";
import ArticleList from "@/components/public/ArticleList";
import Pagination from "@/components/public/Pagination";
import HeroSection from "@/components/public/HeroSection";
import PublicLayout from "@/components/public/PublicLayout";

const PAGE_SIZE = 10;

interface HomePageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const [articles, total] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        category: { select: { name: true, slug: true } },
        tags: {
          select: {
            tag: { select: { name: true, slug: true } },
          },
        },
      },
    }),
    prisma.post.count({ where: { published: true } }),
  ]);

  const articlesWithTags = articles.map((a) => ({
    ...a,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    tags: a.tags.map((t) => t.tag),
  }));

  return (
    <div>
      <HeroSection />
      <PublicLayout>
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold">
            <span className="bg-gradient-to-r from-pink-500 via-purple-500 to-sky-400 bg-clip-text text-transparent">
              最新文章
            </span>
          </h1>
          <p className="text-purple-400 dark:text-purple-500">
            ✨ 记录代码与生活的点点滴滴 ✨
          </p>
        </div>
        <ArticleList articles={articlesWithTags} />
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / PAGE_SIZE)}
        />
      </PublicLayout>
    </div>
  );
}
