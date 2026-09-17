"use client";

import { useEffect } from "react";

/**
 * 管理端错误边界。之前只有根级 app/error.tsx，管理页崩溃时会把整个后台外壳
 * （侧边栏与导航）一起替换掉，用户失去所有上下文与退出路径。
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] 页面渲染失败", error.digest ?? "", error);
  }, [error]);

  return (
    <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/60 p-6 dark:border-red-900/40 dark:bg-red-950/30">
      <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-300">
        管理页面加载失败
      </h2>
      <p className="mb-4 text-sm text-red-600 dark:text-red-400">
        页面渲染时发生错误。你可以重试，或从左侧菜单切换到其他管理页面。
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
      >
        重试
      </button>
    </div>
  );
}
