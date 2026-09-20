import Link from "next/link";
import Image from "next/image";
import TagBadge from "./TagBadge";
import { formatDate } from "@/lib/utils";
import { shouldSkipImageOptimization } from "@/lib/images";
import { KunFishIcon } from "@/components/public/layout/SiteIcons";

interface ArticleCardProps {
  slug: string;
  title: string;
  coverImage: string | null;
  publishedAt: string | null;
  tags: { name: string; slug: string }[];
  /** 列表与首页共用；传入时在元信息行展示阅读时长 */
  readingMinutes?: number;
  /**
   * 卡片标题的标题级别。
   *
   * 列表页（`/articles`、标签页、分类页）的 `<h1>` 由 PageHeader 提供，
   * 卡片标题用 `h2` 才不会跳级；首页/相关文章里卡片位于一个 `h2` 小节之下，
   * 这时必须传 `h3`。
   */
  headingLevel?: "h2" | "h3";
}

/**
 * 横向文章卡片：左侧封面缩略图 + 右侧标题/时间/标签。
 *
 * 横向布局让封面只占卡片的一小条——有封面的文章图片立刻可见，无封面的
 * 文章水印占位不再形成整面「空图墙」；右侧聚焦站主要的三样信息:
 * 名称、时间、标签(摘要与分类在详情页/首页其他区块仍有出口)。
 */
export default function ArticleCard({
  slug,
  title,
  coverImage,
  publishedAt,
  tags,
  readingMinutes,
  headingLevel = "h2",
}: ArticleCardProps) {
  const Heading = headingLevel;
  const visibleTags = tags.slice(0, 2);
  const hiddenTagCount = tags.length - visibleTags.length;

  // 无封面占位的色相变体:按 slug 哈希在三组令牌渐变间轮换,
  // 让连续几条无封面卡片的占位色带不再完全相同。
  const PLACEHOLDER_TINTS = [
    {
      bg: "bg-[linear-gradient(135deg,var(--primary-soft),var(--accent-soft))]",
      fish: "text-primary/30",
    },
    {
      bg: "bg-[linear-gradient(135deg,var(--accent-soft),var(--bg-subtle))]",
      fish: "text-accent-deep/25",
    },
    {
      bg: "bg-[linear-gradient(135deg,var(--bg-subtle),var(--primary-soft))]",
      fish: "text-primary/25",
    },
  ];
  const tint = PLACEHOLDER_TINTS[[...slug].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PLACEHOLDER_TINTS.length];

  return (
    <article className="group flex overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors duration-150 hover:border-line-strong">
      <Link
        href={`/articles/${slug}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block w-28 shrink-0 self-stretch overflow-hidden bg-bg-subtle sm:w-44"
      >
        {coverImage ? (
          <Image
            src={coverImage}
            alt=""
            fill
            sizes="(max-width: 640px) 112px, 176px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized={shouldSkipImageOptimization(coverImage)}
          />
        ) : (
          <span className={`relative flex h-full w-full items-center justify-center overflow-hidden ${tint.bg}`}>
            <span
              aria-hidden="true"
              className="absolute -right-4 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-6 -left-4 h-20 w-20 rounded-full bg-accent/10 blur-2xl"
            />
            <KunFishIcon className={`relative h-10 w-10 transition-transform duration-500 group-hover:scale-110 ${tint.fish}`} />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <Heading className="text-balance text-base font-semibold leading-snug text-ink">
          <Link href={`/articles/${slug}`} className="transition-colors hover:text-primary-deep">
            {title}
          </Link>
        </Heading>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-micro text-ink-3">
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
