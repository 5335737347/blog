import type { PostSummary } from "@/types";
import ArticleCard from "./ArticleCard";

interface ArticleListProps {
  articles: PostSummary[];
}

export default function ArticleList({ articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="py-20 text-center text-purple-400 dark:text-purple-500">
        <p className="text-lg">🌸 暂无文章</p>
        <p className="mt-2 text-sm">还没有发布任何文章，请稍后再来。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {articles.map((article) => (
        <ArticleCard
          key={article.id}
          slug={article.slug}
          title={article.title}
          excerpt={article.excerpt}
          coverImage={article.coverImage ?? null}
          publishedAt={article.publishedAt}
          tags={article.tags}
          category={article.category}
        />
      ))}
    </div>
  );
}
