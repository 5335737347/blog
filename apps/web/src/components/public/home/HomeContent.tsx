import Link from "next/link";
import type { HomePageData, ProfileDto } from "@kpblog/contracts";
import ArticleCard from "@/components/public/articles/ArticleCard";
import { ChevronRightIcon, FolderIcon, SproutIcon } from "@/components/public/layout/SiteIcons";

interface HomeContentProps extends HomePageData {
  profile: Pick<ProfileDto, "now" | "headline" | "name">;
}

/** 区块标题：kicker + 标题 + 右侧「更多」入口 */
function SectionHeader({
  id,
  kicker,
  title,
  moreHref,
  moreLabel,
}: {
  id: string;
  kicker: string;
  title: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2 id={id} className="mt-1.5 text-xl font-semibold text-ink">
          {title}
        </h2>
      </div>
      {moreHref && (
        <Link
          href={moreHref}
          className="inline-flex items-center gap-1 text-meta font-medium text-ink-3 transition-colors hover:text-primary-deep"
        >
          {moreLabel}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function HomeContent({ recentPosts, categories, tags, profile }: HomeContentProps) {
  return (
    <div className="mx-auto max-w-content px-5 py-14 sm:px-6 sm:py-16">
      {/* 1. 最新文章 */}
      <section id="latest" aria-labelledby="latest-articles" className="scroll-mt-24">
        <SectionHeader
          id="latest-articles"
          kicker="Latest"
          title="最新文章"
          moreHref="/articles"
          moreLabel="全部文章"
        />
        {recentPosts.length === 0 ? (
          <div className="empty-state">
            <p className="text-meta">还没有发布文章，敬请期待。</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {recentPosts.slice(0, 6).map((post) => (
              <ArticleCard
                key={post.id}
                slug={post.slug}
                title={post.title}
                excerpt={post.excerpt}
                coverImage={post.coverImage ?? null}
                publishedAt={post.publishedAt}
                tags={post.tags}
                category={post.category}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2. 最近在做 */}
      {profile.now && (
        <section aria-labelledby="home-now" className="mt-14">
          <div className="rounded-md border border-line bg-bg-subtle p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-surface text-primary-deep">
                <SproutIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 id="home-now" className="text-base font-semibold text-ink">
                  最近在做
                </h2>
                <p className="mt-2 max-w-read whitespace-pre-line text-meta leading-relaxed text-ink-2">
                  {profile.now}
                </p>
                <Link
                  href="/now"
                  className="mt-3 inline-flex items-center gap-1 text-meta font-medium text-ink-3 transition-colors hover:text-primary-deep"
                >
                  查看近况
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. 分类与标签 */}
      {(categories.length > 0 || tags.length > 0) && (
        <section className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          {categories.length > 0 && (
            <div aria-labelledby="home-categories">
              <SectionHeader id="home-categories" kicker="Categories" title="分类浏览" />
              <ul className="grid gap-1.5">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-ui text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink"
                    >
                      <FolderIcon className="h-4 w-4 shrink-0 text-ink-4" />
                      <span className="min-w-0 truncate">{category.name}</span>
                      <span className="ml-auto text-micro text-ink-3">{category.postCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 0 && (
            <div aria-labelledby="home-tags">
              <SectionHeader id="home-tags" kicker="Tags" title="标签" />
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 24).map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/tags/${tag.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-bg-subtle px-3 py-1.5 text-meta text-ink-2 transition-colors hover:bg-primary-soft hover:text-primary-deep"
                  >
                    {tag.name}
                    <span className="text-micro text-ink-3">{tag.postCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
