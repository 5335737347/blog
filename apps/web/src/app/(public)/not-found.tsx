import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <div className="mb-6 text-8xl animate-float">🌸</div>
      <h1 className="mb-2 text-7xl font-bold">
        <span className="bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
          404
        </span>
      </h1>
      <p className="mb-8 text-lg text-purple-400 dark:text-purple-500">
        诶？这个页面好像走丢了...
      </p>
      <Link
        href="/"
        className="rounded-2xl bg-gradient-to-r from-pink-400 to-purple-400 px-6 py-3 text-sm font-medium text-white shadow-md shadow-pink-200 hover:from-pink-500 hover:to-purple-500 dark:shadow-purple-900/30 transition-all hover:scale-105 active:scale-95"
      >
        🌸 返回首页
      </Link>
    </div>
  );
}
