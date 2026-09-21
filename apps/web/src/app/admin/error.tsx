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
    <div role="alert" className="rounded-sm border border-danger/30 bg-danger-soft p-6">
      <h2 className="mb-2 text-lg font-semibold text-danger">
        管理页面加载失败
      </h2>
      <p className="mb-4 text-meta text-danger">
        页面渲染时发生错误。你可以重试，或从左侧菜单切换到其他管理页面。
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="rounded-sm bg-danger px-4 py-2 text-meta font-medium text-white transition-colors hover:bg-danger/90"
      >
        重试
      </button>
    </div>
  );
}
