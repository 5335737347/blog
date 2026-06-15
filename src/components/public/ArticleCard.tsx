import Link from "next/link";
import Card from "@/components/ui/Card";
import TagBadge from "./TagBadge";
import { formatDate } from "@/lib/utils";

interface ArticleCardProps {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  tags: { name: string; slug: string }[];
  category: { name: string; slug: string } | null;
}

export default function ArticleCard({
  slug,
  title,
  excerpt,
  coverImage,
  publishedAt,
  tags,
  category,
}: ArticleCardProps) {
  return (
    <Card as="article">
      {coverImage && (
        <div className="-mx-6 -mt-6 mb-4 overflow-hidden rounded-t-2xl">
          <img
            src={coverImage}
            alt={title}
            className="h-48 w-full object-cover transition-transform duration-500 hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-col gap-3">
        {category && (
          <Link
            href={`/tags/${category.slug}`}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-pink-100 to-purple-100 px-3 py-1 text-xs font-medium text-purple-600 hover:from-pink-200 hover:to-purple-200 dark:from-pink-900/30 dark:to-purple-900/30 dark:text-purple-300 transition-all"
          >
            📁 {category.name}
          </Link>
        )}
        <Link href={`/articles/${slug}`} className="group">
          <h2 className="text-xl font-bold text-purple-950 group-hover:text-pink-500 dark:text-purple-50 dark:group-hover:text-pink-400 transition-colors">
            {title}
          </h2>
        </Link>
        {excerpt && (
          <p className="text-sm text-purple-600/70 dark:text-purple-300/70 leading-relaxed">
            {excerpt}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <TagBadge key={tag.slug} name={tag.name} slug={tag.slug} />
            ))}
          </div>
          {publishedAt && (
            <time
              dateTime={publishedAt}
              className="shrink-0 text-xs text-purple-300 dark:text-purple-500"
            >
              📅 {formatDate(publishedAt)}
            </time>
          )}
        </div>
      </div>
    </Card>
  );
}
