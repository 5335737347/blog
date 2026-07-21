import Link from "next/link";
import Image from "next/image";
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

function shouldSkipImageOptimization(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.toLowerCase().endsWith(".svg");
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
    <Card as="article" className="group overflow-hidden !p-0">
      {coverImage && (
        <div className="relative aspect-[16/7] overflow-hidden bg-pink-50 dark:bg-purple-900/20">
          <Image
            src={coverImage}
            alt={title}
            fill
            sizes="(max-width: 1024px) 100vw, 640px"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            unoptimized={shouldSkipImageOptimization(coverImage)}
          />
        </div>
      )}
      <div className="flex flex-col gap-4 p-5 sm:p-7">
        {category && (
          <Link
            href={`/categories/${category.slug}`}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-pink-100 to-purple-100 px-3 py-1 text-xs font-medium text-purple-600 hover:from-pink-200 hover:to-purple-200 dark:from-pink-900/30 dark:to-purple-900/30 dark:text-purple-300 transition-all"
          >
            📁 {category.name}
          </Link>
        )}
        <Link href={`/articles/${slug}`} className="group">
          <h2 className="text-balance text-xl font-extrabold tracking-tight text-purple-950 transition-colors group-hover:text-pink-600 dark:text-purple-50 dark:group-hover:text-pink-300 sm:text-2xl">
            {title}
          </h2>
        </Link>
        {excerpt && (
          <p className="line-clamp-3 text-sm leading-7 text-[--muted]">
            {excerpt}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-pink-100/80 pt-4 dark:border-purple-800/30">
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
