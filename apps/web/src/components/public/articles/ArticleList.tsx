import type { PostSummary } from "@kpblog/contracts";
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
      {articles.map((article, i) => (
        <div
          key={article.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <ArticleCard
            slug={article.slug}
            title={article.title}
            excerpt={article.excerpt}
            coverImage={article.coverImage ?? null}
            publishedAt={article.publishedAt}
            tags={article.tags}
            category={article.category}
          />
        </div>
      ))}
    </div>
  );
}
