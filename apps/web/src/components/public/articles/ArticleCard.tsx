import Link from "next/link";
import Image from "next/image";
import TagBadge from "./TagBadge";
import { formatDate } from "@/lib/utils";
import { shouldSkipImageOptimization } from "@/lib/images";
import { KunFishIcon } from "@/components/public/layout/SiteIcons";

interface ArticleCardProps {
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  tags: { name: string; slug: string }[];
  category: { name: string; slug: string } | null;
  /** 列表与首页共用；传入时在元信息行展示阅读时长 */
  readingMinutes?: number;
}

/**
 * 文章卡片：固定 16/9 封面 + 分类 + 标题 + 摘要 + 元信息。
 * 无封面时回落为柔和渐变色块，保证栅格不塌、不用装饰性插画撑版面。
 */
export default function ArticleCard({
  slug,
  title,
  excerpt,
  coverImage,
  publishedAt,
  tags,
  category,
  readingMinutes,
}: ArticleCardProps) {
  const visibleTags = tags.slice(0, 2);
  const hiddenTagCount = tags.length - visibleTags.length;

  return (
    <article className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-colors duration-150 hover:border-line-strong">
      <Link
        href={`/articles/${slug}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[16/9] overflow-hidden bg-bg-subtle"
      >
        {coverImage ? (
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 380px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            unoptimized={shouldSkipImageOptimization(coverImage)}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--primary-soft),var(--accent-soft))]">
            <KunFishIcon className="h-9 w-9 text-primary/60" />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-5">
        {category && (
          <Link
            href={`/categories/${category.slug}`}
            className="w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-medium text-accent-deep transition-colors hover:bg-accent/15"
          >
            {category.name}
          </Link>
        )}

        <h3 className="text-balance text-base font-semibold leading-snug text-ink">
          <Link href={`/articles/${slug}`} className="transition-colors hover:text-primary-deep">
            {title}
          </Link>
        </h3>

        {excerpt && (
          <p className="line-clamp-2 text-meta leading-relaxed text-ink-3">{excerpt}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-3 text-micro text-ink-3">
          {publishedAt && (
            <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>
          )}
          {readingMinutes ? <span>{readingMinutes} 分钟</span> : null}
          {(visibleTags.length > 0 || hiddenTagCount > 0) && (
            <span className="ml-auto flex items-center gap-1.5">
              {visibleTags.map((tag) => (
                <TagBadge key={tag.slug} name={tag.name} slug={tag.slug} />
              ))}
              {hiddenTagCount > 0 && <span className="text-ink-3">+{hiddenTagCount}</span>}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
