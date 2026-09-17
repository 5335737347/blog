import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getArchiveData } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { formatDate } from "@/lib/utils";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "归档",
    description: "按时间浏览全部文章",
    alternates: { canonical: `${siteUrl}/archive` },
  };
}

export default async function ArchivePage() {
  const { total, years } = await getArchiveData();

  return (
    <PageShell>
      <PageHeader
        kicker="Archive"
        title="归档"
        description="按时间倒序浏览全部文章。"
        meta={total > 0 ? `共 ${total} 篇` : undefined}
      />

      {total === 0 ? (
        <div className="empty-state">还没有发布文章，敬请期待。</div>
      ) : (
        <div className="flex flex-col gap-10">
          {years.map((group) => (
            <section key={group.year ?? "unknown"}>
              <h2 className="sticky top-16 z-10 -mx-1 mb-2 flex items-baseline gap-3 bg-bg/90 px-1 py-2 text-xl font-semibold text-ink backdrop-blur-sm">
                {group.year ?? "未标注日期"}
                <span className="text-micro font-normal text-ink-3">{group.posts.length} 篇</span>
              </h2>
              <ul className="flex flex-col">
                {group.posts.map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/articles/${post.slug}`}
                      className="group flex items-baseline gap-4 rounded-sm border-b border-line px-2 py-2.5 transition-colors last:border-b-0 hover:bg-surface-hover"
                    >
                      <time
                        dateTime={post.publishedAt ?? undefined}
                        className="w-24 shrink-0 text-micro text-ink-3"
                      >
                        {post.publishedAt
                          ? formatDate(post.publishedAt).replace(/^\d+年/, "")
                          : "—"}
                      </time>
                      <span className="min-w-0 text-ui text-ink-2 transition-colors group-hover:text-primary-deep">
                        {post.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
