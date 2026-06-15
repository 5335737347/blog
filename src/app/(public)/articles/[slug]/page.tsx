import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import MarkdownContent from "@/components/public/MarkdownContent";
import TagBadge from "@/components/public/TagBadge";
import CommentSection from "@/components/public/CommentSection";
import PublicLayout from "@/components/public/PublicLayout";
import TableOfContents from "@/components/public/TableOfContents";
import { formatDate, readingTime } from "@/lib/utils";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;

  const post = await prisma.post.findUnique({
    where: { slug, published: true },
    select: {
      id: true,
      title: true,
      excerpt: true,
      content: true,
      contentHtml: true,
      coverImage: true,
      publishedAt: true,
      category: { select: { name: true, slug: true } },
      tags: {
        select: {
          tag: { select: { name: true, slug: true } },
        },
      },
    },
  });

  if (!post) notFound();

  const tags = post.tags.map((t) => t.tag);

  return (
    <PublicLayout>
      <article>
        <header className="mb-10">
          {post.coverImage && (
            <div className="mb-6 overflow-hidden rounded-2xl">
              <img
                src={post.coverImage}
                alt={post.title}
                className="w-full max-h-96 object-cover"
              />
            </div>
          )}
          {post.category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-100 to-purple-100 px-3 py-1 text-sm font-medium text-purple-600 dark:from-pink-900/30 dark:to-purple-900/30 dark:text-purple-300">
              📁 {post.category.name}
            </span>
          )}
          <h1 className="mt-4 mb-4 text-4xl font-bold text-purple-950 dark:text-purple-50">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mb-4 text-lg text-purple-500 dark:text-purple-400">
              {post.excerpt}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <TagBadge key={tag.slug} name={tag.name} slug={tag.slug} />
              ))}
            </div>
            {post.publishedAt && (
              <time
                dateTime={post.publishedAt.toISOString()}
                className="text-sm text-purple-300 dark:text-purple-500"
              >
                📅 {formatDate(post.publishedAt)} · 📖 {readingTime(post.content)} 分钟
              </time>
            )}
          </div>
        </header>

        <TableOfContents content={post.content} />

        <div className="border-t-2 border-pink-100 pt-8 dark:border-purple-800/30">
          {post.contentHtml ? (
            <div
              className="prose max-w-none dark:prose-invert prose-headings:text-purple-950 dark:prose-headings:text-purple-100 prose-headings:font-bold prose-a:text-pink-500 dark:prose-a:text-pink-400 prose-a:no-underline hover:prose-a:text-purple-500 prose-code:before:content-none prose-code:after:content-none prose-code:rounded-lg prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-pink-600 dark:prose-code:bg-purple-900/40 dark:prose-code:text-pink-300 prose-pre:rounded-2xl prose-pre:bg-purple-950 dark:prose-pre:bg-purple-950 prose-pre:border prose-pre:border-purple-800 prose-img:rounded-2xl prose-blockquote:border-pink-400 prose-blockquote:bg-pink-50/50 dark:prose-blockquote:bg-purple-900/20 prose-blockquote:rounded-r-xl prose-table:rounded-2xl"
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            />
          ) : (
            <MarkdownContent content={post.content} />
          )}
        </div>
      </article>

      <hr className="my-12 border-pink-100 dark:border-purple-800/30" />

      <CommentSection postId={post.id} />
    </PublicLayout>
  );
}
