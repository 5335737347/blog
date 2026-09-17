"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="section-kicker">Something went wrong</p>
      <h1 className="mt-3 text-3xl font-bold text-purple-900 dark:text-purple-100">
        页面暂时无法加载
      </h1>
      <p className="mt-3 text-sm leading-6 text-[--muted]">
        服务可能正在更新，请稍后重试。如果问题持续存在，请联系站点管理员。
      </p>
      <Button className="mt-6" onClick={() => unstable_retry()}>
        重新加载
      </Button>
    </main>
  );
}
