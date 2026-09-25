import Link from "next/link";
import type { ReactNode } from "react";
import type { HomePageData, ProfileDto } from "@kpblog/contracts";
import ArticleCard from "@/components/public/articles/ArticleCard";
import { ChevronRightIcon, SproutIcon } from "@/components/public/layout/SiteIcons";

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

/** 侧边栏小标题 */
function SideHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-ui font-semibold text-ink">
      {children}
    </h3>
  );
}

export default function HomeContent({ recentPosts, categories, tags, profile }: HomeContentProps) {
  return (
    <div className="mx-auto max-w-content px-5 py-14 sm:px-6 sm:py-16">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-10">
        {/* 主列:最新文章 */}
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
            <div className="grid gap-4">
              {recentPosts.slice(0, 6).map((post) => (
                <ArticleCard
                  headingLevel="h3"
                  key={post.id}
                  slug={post.slug}
                  title={post.title}
                  coverImage={post.coverImage ?? null}
                  publishedAt={post.publishedAt}
                  tags={post.tags}
                />
              ))}
            </div>
          )}
        </section>

        {/*
          侧边栏:近况 / 分类 / 标签。
          桌面端吸附在头部下方随滚动跟随;移动端堆叠在最新文章之后。
          注意:这不是全站导航侧边栏(头部导航仍是唯一导航),只是首页的
          内容挂件列,由站主 2026-09-18 明确要求恢复。
        */}
        <aside
          aria-label="近况与分类"
          className="mt-14 space-y-9 lg:sticky lg:top-24 lg:mt-0 lg:max-h-[calc(100svh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-1 [&>section]:border-b [&>section]:border-line [&>section]:pb-9 [&>section:last-child]:border-b-0 [&>section:last-child]:pb-0"
        >
          {profile.now && (
            <section aria-labelledby="side-now">
              <SideHeading id="side-now">
                <SproutIcon className="h-4 w-4 text-primary" />
                最近在做
              </SideHeading>
              <p className="mt-3 whitespace-pre-line text-meta leading-relaxed text-ink-2">
                {profile.now}
              </p>
              <Link
                href="/now"
                className="mt-2.5 inline-flex items-center gap-1 text-meta font-medium text-ink-3 transition-colors hover:text-primary-deep"
              >
                查看近况
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Link>
            </section>
          )}

          {categories.length > 0 && (
            <section aria-labelledby="side-categories">
              <SideHeading id="side-categories">分类</SideHeading>
              <ul className="mt-3 grid gap-0.5">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="-mx-2 flex items-baseline justify-between rounded-sm px-2 py-1.5 text-ui text-ink-2 transition-colors hover:bg-surface-hover hover:text-ink"
                    >
                      <span className="min-w-0 truncate">{category.name}</span>
                      <span className="shrink-0 text-micro tabular-nums text-ink-3">
                        {category.postCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tags.length > 0 && (
            <section aria-labelledby="side-tags">
              <SideHeading id="side-tags">标签</SideHeading>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.slice(0, 24).map((tag) => (
                  <Link
                    key={tag.slug}
                    href={`/tags/${tag.slug}`}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-meta text-ink-2 transition-colors hover:border-primary-soft hover:bg-primary-soft hover:text-primary-deep"
                  >
                    <span className="text-ink-3">#</span>
                    {tag.name}
                    <span className="text-micro tabular-nums text-ink-3">{tag.postCount}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
