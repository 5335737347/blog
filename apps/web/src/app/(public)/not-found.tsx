import Link from "next/link";
import { HomeIcon, SearchIcon } from "@/components/public/layout/SiteIcons";

/**
 * 404：允许使用沉浸式背景（与首页 hero 同属例外），但保持单屏紧凑。
 */
export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden bg-slate-900 [background-image:radial-gradient(120%_80%_at_20%_0%,rgba(239,95,122,.35),transparent_60%),radial-gradient(120%_80%_at_85%_20%,rgba(77,169,232,.32),transparent_55%)]">
      <div className="relative z-10 px-5 py-20 text-center">
        <p className="text-6xl font-bold leading-none text-white/95 sm:text-7xl">404</p>
        <h1 className="mt-5 text-xl font-semibold text-white sm:text-2xl">
          这个页面好像走丢了
        </h1>
        <p className="mx-auto mt-3 max-w-md text-ui leading-relaxed text-white/75">
          链接可能已经失效，或者这篇文章还没有发布。可以回到首页，或者直接搜索你想看的内容。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="btn border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <HomeIcon className="h-4 w-4" />
            返回首页
          </Link>
          <Link
            href="/articles"
            className="btn border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <SearchIcon className="h-4 w-4" />
            浏览全部文章
          </Link>
        </div>
      </div>
    </div>
  );
}
