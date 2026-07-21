import type { Metadata } from "next";
import ArticleList from "@/components/public/articles/ArticleList";
import Pagination from "@/components/public/articles/Pagination";
import ContentLayout from "@/components/public/layout/ContentLayout";
import { getArticleIndexPageData } from "@/lib/api/public-api";

const PAGE_SIZE = 10;

export const metadata: Metadata = {
  title: "文章",
  description: "浏览全部博客文章",
};

interface ArticleIndexPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function ArticleIndexPage({ searchParams }: ArticleIndexPageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
  const articles = await getArticleIndexPageData(page, PAGE_SIZE);

  return (
    <section className="min-h-[70vh] bg-[linear-gradient(155deg,#ffffff_0%,#fff5f7_44%,#eef8ff_100%)] dark:bg-[linear-gradient(155deg,#151b2a_0%,#271f31_48%,#172b40_100%)]">
      <ContentLayout>
        <div className="mb-8 border-b border-pink-100 pb-5 dark:border-purple-800/40">
          <p className="section-kicker">All writing</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-purple-950 dark:text-purple-50">文章</h1>
          <p className="mt-2 text-sm leading-6 text-[--muted]">持续记录技术实践、学习过程与生活观察。</p>
        </div>
        <ArticleList articles={articles.items} />
        <Pagination currentPage={page} totalPages={articles.totalPages} />
      </ContentLayout>
    </section>
  );
}
