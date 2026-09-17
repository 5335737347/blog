import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import MarkdownContent from "@/components/public/articles/MarkdownContent";
import ArticleCard from "@/components/public/articles/ArticleCard";
import TagBadge from "@/components/public/articles/TagBadge";
import CommentSection from "@/components/public/comments/CommentSection";
import ArticleReader from "@/components/public/layout/ArticleReader";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/public/layout/SiteIcons";
import { formatDate, readingTime, wordCount } from "@/lib/utils";
import { getArticleAdjacentData, getArticlePageData } from "@/lib/api/public-api";
import { getOpenGraphImageUrl, getSiteUrl } from "@/lib/env";
import { shouldSkipImageOptimization } from "@/lib/images";
import Link from "next/link";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getArticlePageData(slug);
  if (!post) return { title: "文章不存在" };

  const siteUrl = getSiteUrl();
  const configuredImage = post.coverImage || getOpenGraphImageUrl();
  const image = configuredImage && (/^https?:\/\//i.test(configuredImage) || siteUrl)
    ? configuredImage
    : "";
  const canonical = siteUrl ? `${siteUrl}/articles/${post.slug}` : undefined;

  return {
    title: post.title,
    description: post.excerpt || undefined,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt || undefined,
      url: canonical,
      publishedTime: post.publishedAt || undefined,
      modifiedTime: post.updatedAt,
      tags: post.tags.map((tag) => tag.name),
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: post.title,
      description: post.excerpt || undefined,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;

  // 正文与相邻文章互不依赖，并行发起；串行会多付一次完整往返。
  const [post, adjacent] = await Promise.all([
    getArticlePageData(slug),
    getArticleAdjacentData(slug),
  ]);

  if (!post) notFound();

  const siteUrl = getSiteUrl();
  const articleUrl = siteUrl ? `${siteUrl}/articles/${post.slug}` : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt,
    mainEntityOfPage: articleUrl || undefined,
    image: post.coverImage || undefined,
    keywords: post.tags.map((tag) => tag.name).join(", ") || undefined,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首页", item: siteUrl || undefined },
      ...(post.category
        ? [{
            "@type": "ListItem",
            position: 2,
            name: post.category.name,
            item: siteUrl ? `${siteUrl}/categories/${post.category.slug}` : undefined,
          }]
        : []),
      { "@type": "ListItem", position: post.category ? 3 : 2, name: post.title },
    ],
  };

  return (
    <ArticleReader content={post.content} articleUrl={articleUrl} title={post.title}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }}
      />

      <article>
        <header className="max-w-read">
          <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1.5 text-meta text-ink-3">
            <Link href="/" className="transition-colors hover:text-primary-deep">首页</Link>
            {post.category && (
              <>
                <span aria-hidden="true">/</span>
                <Link
                  href={`/categories/${post.category.slug}`}
                  className="transition-colors hover:text-primary-deep"
                >
                  {post.category.name}
                </Link>
              </>
            )}
          </nav>

          <h1 className="mt-4 text-3xl font-bold leading-[1.25] tracking-[-0.01em] text-ink sm:text-4xl">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="mt-3 text-lg leading-relaxed text-ink-2">{post.excerpt}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-ink-3">
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            )}
            <span>{readingTime(post.content)} 分钟阅读</span>
            <span>{wordCount(post.content)} 字</span>
          </div>

          {post.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag.slug} name={tag.name} slug={tag.slug} />
              ))}
            </div>
          )}
        </header>

        {post.coverImage && (
          <div data-print="cover" className="relative mt-8 aspect-[16/9] max-w-read overflow-hidden rounded-md border border-line bg-bg-subtle">
            <Image
              src={post.coverImage}
              alt=""
              fill
              // 封面在首屏且通常是文章页的 LCP 元素，不能懒加载。
              priority
              sizes="(max-width: 1024px) 100vw, 720px"
              className="object-cover"
              unoptimized={shouldSkipImageOptimization(post.coverImage)}
            />
          </div>
        )}

        <div className="mt-10 max-w-read border-t border-line pt-8">
          <MarkdownContent content={post.content} />
        </div>
      </article>

      {(adjacent?.previous || adjacent?.next) && (
        <nav aria-label="文章导航" className="mt-12 grid max-w-read gap-4 sm:grid-cols-2">
          {adjacent.previous ? (
            <Link
              href={`/articles/${adjacent.previous.slug}`}
              className="group flex flex-col gap-1 rounded-md border border-line bg-surface p-4 transition-colors hover:border-line-strong"
            >
              <span className="inline-flex items-center gap-1 text-micro text-ink-3">
                <ChevronLeftIcon className="h-3.5 w-3.5" />上一篇
              </span>
              <span className="line-clamp-2 text-ui font-medium text-ink transition-colors group-hover:text-primary-deep">
                {adjacent.previous.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
          {adjacent.next ? (
            <Link
              href={`/articles/${adjacent.next.slug}`}
              className="group flex flex-col items-end gap-1 rounded-md border border-line bg-surface p-4 text-right transition-colors hover:border-line-strong"
            >
              <span className="inline-flex items-center gap-1 text-micro text-ink-3">
                下一篇<ChevronRightIcon className="h-3.5 w-3.5" />
              </span>
              <span className="line-clamp-2 text-ui font-medium text-ink transition-colors group-hover:text-primary-deep">
                {adjacent.next.title}
              </span>
            </Link>
          ) : (
            <span className="hidden sm:block" aria-hidden="true" />
          )}
        </nav>
      )}

      {adjacent && adjacent.related.length > 0 && (
        <section aria-labelledby="related-posts" data-print="hide" className="mt-14">
          <h2 id="related-posts" className="mb-5 text-xl font-semibold text-ink">
            相关文章
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {adjacent.related.map((relatedPost) => (
              <ArticleCard
                headingLevel="h3"
                key={relatedPost.id}
                slug={relatedPost.slug}
                title={relatedPost.title}
                excerpt={relatedPost.excerpt}
                coverImage={relatedPost.coverImage ?? null}
                publishedAt={relatedPost.publishedAt}
                tags={relatedPost.tags}
                category={relatedPost.category}
              />
            ))}
          </div>
        </section>
      )}

      <div data-print="hide" className="mt-14 max-w-read border-t border-line pt-10">
        <CommentSection postId={post.id} />
      </div>
    </ArticleReader>
  );
}
