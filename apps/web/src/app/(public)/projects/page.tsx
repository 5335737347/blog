import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { getProjectsData } from "@/lib/api/public-api";
import { shouldSkipImageOptimization } from "@/lib/images";
import { formatDate } from "@/lib/utils";
import { pageAlternates } from "@/lib/metadata";

/*
  项目页与归档时代的首页壁纸同理：数据驱动但允许短暂滞后。
  revalidate = 300 与站点其他数据页同策略。
*/
export const revalidate = 300;

export function generateMetadata(): Metadata {
  return {
    title: "项目",
    description: "按项目整理的作品与系列，每个项目汇集同一工作单元下的全部文章。",
    alternates: pageAlternates("/projects"),
  };
}

export default async function ProjectsPage() {
  const { projects } = await getProjectsData();

  return (
    <PageShell>
      <PageHeader
        kicker="Projects"
        title="项目"
        description="按项目整理的作品与系列；全部文章请前往「文章」页检索。"
        meta={projects.length > 0 ? `共 ${projects.length} 个项目` : undefined}
      />

      {projects.length === 0 ? (
        <div className="empty-state">还没有建立项目。在后台「项目管理」创建后，归入项目的文章会汇集在这里。</div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/collections/${project.slug}`}
                className="panel panel-hover group flex h-full flex-col overflow-hidden"
              >
                {project.coverImage ? (
                  <div className="relative aspect-[21/9] w-full border-b border-line">
                    <Image
                      src={project.coverImage}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 50vw, 100vw"
                      className="object-cover"
                      unoptimized={shouldSkipImageOptimization(project.coverImage)}
                    />
                  </div>
                ) : null}
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-semibold text-ink transition-colors group-hover:text-primary-deep">
                    {project.name}
                  </h2>
                  {project.description && (
                    <p className="mt-1.5 line-clamp-2 text-meta text-ink-3">{project.description}</p>
                  )}
                  <p className="mt-auto pt-3 text-micro text-ink-3">
                    {project.postCount} 篇
                    {project.latestPublishedAt &&
                      ` · 最近更新 ${formatDate(project.latestPublishedAt)}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
