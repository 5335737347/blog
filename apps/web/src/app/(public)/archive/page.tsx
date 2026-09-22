import type { Metadata } from "next";
import Link from "next/link";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getArchiveData } from "@/lib/api/public-api";
import { formatDate } from "@/lib/utils";
import { pageAlternates } from "@/lib/metadata";

/*
  归档页是数据驱动的静态页：没有这个声明，它会在构建期被预渲染成
  固定 HTML——构建时 API 不可达，空状态就被永久烤进产物（实测复现）；
  生产上即使构建时 API 在线，两次部署之间新发布的文章也不会出现。
  revalidate = 300 与首页的 60 秒同策略：允许短暂滞后，但一定会自愈。
*/
export const revalidate = 300;

export function generateMetadata(): Metadata {
  return {
    title: "归档",
    description: "按项目浏览全部文章，未归入项目的按年份分组。",
    alternates: pageAlternates("/archive"),
  };
}

function PostRows({
  posts,
}: {
  posts: { slug: string; title: string; publishedAt: string | null }[];
}) {
  return (
    <ul className="flex flex-col">
      {posts.map((post) => (
        <li key={post.slug}>
          <Link
            href={`/articles/${post.slug}`}
            className="group flex items-baseline gap-4 rounded-sm border-b border-line px-2 py-2.5 transition-colors last:border-b-0 hover:bg-surface-hover"
          >
            <time
              dateTime={post.publishedAt ?? undefined}
              className="w-24 shrink-0 text-micro text-ink-3"
            >
              {post.publishedAt ? formatDate(post.publishedAt).replace(/^\d+年/, "") : "—"}
            </time>
            <span className="min-w-0 text-ui text-ink-2 transition-colors group-hover:text-primary-deep">
              {post.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ArchivePage() {
  const { total, projects, years } = await getArchiveData();

  return (
    <PageShell>
      <PageHeader
        kicker="Archive"
        title="归档"
        description="按项目浏览全部文章；未归入项目的按年份分组。"
        meta={total > 0 ? `共 ${total} 篇` : undefined}
      />

      {total === 0 ? (
        <div className="empty-state">还没有发布文章，敬请期待。</div>
      ) : (
        <div className="flex flex-col gap-10">
          {projects.map(({ project, posts }) => (
            <section key={project.id}>
              <h2 className="sticky top-16 z-10 -mx-1 mb-1 flex items-baseline gap-3 bg-bg/90 px-1 py-2 text-xl font-semibold text-ink backdrop-blur-sm">
                <Link
                  href={`/collections/${project.slug}`}
                  className="hover:text-primary-deep"
                >
                  {project.name}
                </Link>
                <span className="text-micro font-normal text-ink-3">{posts.length} 篇</span>
              </h2>
              {project.description && (
                <p className="mb-2 whitespace-pre-line px-1 text-meta text-ink-3">
                  {project.description}
                </p>
              )}
              <PostRows posts={posts} />
            </section>
          ))}

          {years.map((group) => (
            <section key={group.year ?? "unknown"}>
              <h2 className="sticky top-16 z-10 -mx-1 mb-2 flex items-baseline gap-3 bg-bg/90 px-1 py-2 text-xl font-semibold text-ink backdrop-blur-sm">
                {group.year ?? "未标注日期"}
                <span className="text-micro font-normal text-ink-3">{group.posts.length} 篇</span>
              </h2>
              <PostRows posts={group.posts} />
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
