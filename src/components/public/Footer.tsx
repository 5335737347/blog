import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-pink-100 dark:border-purple-800/30">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 text-sm text-purple-400 dark:text-purple-500">
        <p>
          © {new Date().getFullYear()} 鲲鹏の博客 — Powered by{" "}
          <span className="text-pink-400">Next.js</span> +{" "}
          <span className="text-purple-400">TypeScript</span> ✨
        </p>
        <Link
          href="/admin"
          className="text-purple-400 hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
        >
          🔐 管理
        </Link>
      </div>
    </footer>
  );
}
