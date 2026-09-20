import type { PostSummary } from "@kpblog/contracts";
import { FileTextIcon } from "@/components/public/layout/SiteIcons";
import ArticleCard from "./ArticleCard";

interface ArticleListProps {
  articles: PostSummary[];
}

export default function ArticleList({ articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="empty-state">
        <FileTextIcon className="mx-auto mb-3 h-7 w-7 text-ink-4" />
        <p className="text-meta">还没有发布任何文章，请稍后再来。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {articles.map((article) => (
        <ArticleCard
          key={article.id}
          slug={article.slug}
          title={article.title}
          coverImage={article.coverImage ?? null}
          publishedAt={article.publishedAt}
          tags={article.tags}
        />
      ))}
    </div>
  );
}
