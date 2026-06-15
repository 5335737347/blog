import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Card from "@/components/ui/Card";

async function ProfileCard() {
  return (
    <Card className="text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 via-purple-400 to-sky-400 text-4xl shadow-lg shadow-pink-200 dark:shadow-purple-900/30">
          🌸
        </div>
        <div>
          <h3 className="text-lg font-bold text-purple-950 dark:text-purple-50">
            悠哉代码
          </h3>
          <p className="mt-1 text-xs text-purple-400 dark:text-purple-500">
            CS Student / ACG Lover
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 dark:bg-pink-900/20 dark:text-pink-300">
            💻 编程
          </span>
          <span className="rounded-full bg-purple-50 px-2.5 py-1 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300">
            🎀 ACG
          </span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300">
            ☕ 生活
          </span>
        </div>
      </div>
    </Card>
  );
}

async function TagCloud() {
  const tags = await prisma.tag.findMany({
    select: {
      name: true,
      slug: true,
      _count: { select: { posts: { where: { post: { published: true } } } } },
    },
    orderBy: { name: "asc" },
  });

  const TAG_COLORS = [
    "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-300 dark:hover:bg-pink-900/40",
    "bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40",
    "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40",
    "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
    "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
    "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40",
  ];

  function hashColor(slug: string) {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) {
      hash = slug.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  }

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-purple-900 dark:text-purple-100">
        🏷️ 标签云
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={`/tags/${tag.slug}`}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all hover:scale-105 ${hashColor(tag.slug)}`}
          >
            {tag.name}
            <span className="opacity-60">({tag._count.posts})</span>
          </Link>
        ))}
        {tags.length === 0 && (
          <p className="text-xs text-purple-300 dark:text-purple-600">
            暂无标签
          </p>
        )}
      </div>
    </Card>
  );
}

async function RecentPosts() {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { slug: true, title: true, publishedAt: true },
  });

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-purple-900 dark:text-purple-100">
        📝 最近文章
      </h3>
      {posts.length === 0 ? (
        <p className="text-xs text-purple-300 dark:text-purple-600">暂无文章</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/articles/${post.slug}`}
                className="block text-sm text-purple-700 hover:text-pink-500 dark:text-purple-300 dark:hover:text-pink-400 transition-colors leading-snug"
              >
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function Sidebar() {
  return (
    <aside className="flex flex-col gap-5">
      <ProfileCard />
      <TagCloud />
      <RecentPosts />
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-purple-900 dark:text-purple-100">
          📡 订阅
        </h3>
        <Link
          href="/rss.xml"
          className="inline-flex items-center gap-1.5 text-xs text-purple-500 hover:text-pink-500 dark:text-purple-400 dark:hover:text-pink-400 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z" />
          </svg>
          RSS 订阅
        </Link>
      </Card>
    </aside>
  );
}
