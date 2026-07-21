import Link from "next/link";
import pkg from "../../../../package.json";

export default function Footer({ blogTitle }: { blogTitle: string }) {
  return (
    <footer className="border-t border-pink-100 bg-white/40 dark:border-purple-800/30 dark:bg-purple-950/20">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-4 px-6 py-8 text-sm text-[--muted] sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {blogTitle} — Powered by{" "}
          <span className="text-pink-400">Next.js</span> +{" "}
          <span className="text-purple-400">TypeScript</span> ✨
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/articles" className="footer-link">文章</Link>
          <Link href="/about" className="footer-link">个人介绍</Link>
          <Link href="/messages" className="footer-link">留言</Link>
          <Link href="/now" className="footer-link">近况</Link>
          <Link href="/gallery" className="footer-link">相册</Link>
          <Link href="/rss.xml" className="footer-link">RSS</Link>
          <span className="text-xs text-purple-300 dark:text-purple-600">v{pkg.version}</span>
          <Link
            href="/admin"
            className="text-purple-400 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
          >
            🔐 管理
          </Link>
        </div>
      </div>
    </footer>
  );
}
