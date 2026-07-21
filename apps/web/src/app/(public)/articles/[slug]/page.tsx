import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import MarkdownContent from "@/components/public/articles/MarkdownContent";
import TagBadge from "@/components/public/articles/TagBadge";
import CommentSection from "@/components/public/comments/CommentSection";
import ContentLayout from "@/components/public/layout/ContentLayout";
import TableOfContents from "@/components/public/articles/TableOfContents";
import ReadingProgressBar from "@/components/public/articles/ReadingProgressBar";
import { formatDate, readingTime } from "@/lib/utils";
import { getArticlePageData } from "@/lib/api/public-api";
import { getOpenGraphImageUrl, getSiteUrl } from "@/lib/env";
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

function shouldSkipImageOptimization(src: string): boolean {
  return /^https?:\/\//i.test(src) || src.toLowerCase().endsWith(".svg");
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const post = await getArticlePageData(slug);

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

  return (
      <ContentLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ReadingProgressBar />
      <article className="surface-panel overflow-hidden p-5 sm:p-8 lg:p-10">
        <header className="mb-10">
          <nav aria-label="面包屑" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-[--muted]">
            <Link href="/" className="hover:text-pink-500">首页</Link>
            <span aria-hidden="true">/</span>
            {post.category && <><Link href={`/categories/${post.category.slug}`} className="hover:text-pink-500">{post.category.name}</Link><span aria-hidden="true">/</span></>}
            <span aria-current="page" className="line-clamp-1">{post.title}</span>
          </nav>
          {post.coverImage && (
            <div className="relative mb-6 h-64 overflow-hidden rounded-2xl sm:h-80 lg:h-96">
              <Image
                src={post.coverImage}
                alt={post.title}
                fill
                sizes="(max-width: 1024px) 100vw, 960px"
                className="object-cover"
                unoptimized={shouldSkipImageOptimization(post.coverImage)}
              />
            </div>
          )}
          {post.category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-100 to-purple-100 px-3 py-1 text-sm font-medium text-purple-600 dark:from-pink-900/30 dark:to-purple-900/30 dark:text-purple-300">
              📁 {post.category.name}
            </span>
          )}
          <h1 className="mt-4 mb-4 text-balance text-3xl font-black tracking-[-0.03em] text-purple-950 dark:text-purple-50 sm:text-5xl sm:leading-[1.15]">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mb-4 text-lg text-purple-500 dark:text-purple-400">
              {post.excerpt}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <TagBadge key={tag.slug} name={tag.name} slug={tag.slug} />
              ))}
            </div>
            {post.publishedAt && (
              <time
                dateTime={post.publishedAt}
                className="text-sm text-purple-300 dark:text-purple-500"
              >
                📅 {formatDate(post.publishedAt)} · 📖 {readingTime(post.content)} 分钟
              </time>
            )}
          </div>
        </header>

        <TableOfContents content={post.content} />

        <div className="border-t-2 border-pink-100 pt-8 dark:border-purple-800/30">
          <MarkdownContent content={post.content} />
        </div>
      </article>

      <hr className="my-12 border-pink-100 dark:border-purple-800/30" />

      <CommentSection postId={post.id} />
      </ContentLayout>
  );
}
