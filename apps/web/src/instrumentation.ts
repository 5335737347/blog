/**
 * Next 启动钩子（每个 server 进程执行一次）。
 *
 * Web 与 API 是两个独立进程：Web 通过 /api/* rewrite 代理到 API。
 * 如果只启动了 Web（例如单独执行 `npm run start:web`），页面本身仍能渲染
 * （内容会降级），但每个 /api/* 请求都会以 ECONNREFUSED 失败，
 * 日志里刷满 "Failed to proxy ..." 的堆栈，很难一眼看出真正原因。
 *
 * 这里在启动时探测一次，把结论直接说清楚。
 * 不做硬性失败：站点在设计上允许 API 不可用时继续提供降级页面。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const base = (process.env.API_INTERNAL_URL || "http://127.0.0.1:3002").replace(/\/$/, "");

  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(
      `[启动检查] 无法连接 API (${base})：${reason}\n` +
        "  · 页面仍可访问，但内容会降级（标签、分类、最新文章为空）。\n" +
        "  · 登录、评论、搜索、音乐等 /api/* 请求会失败。\n" +
        "  · 开发环境请用 `npm run dev`（同时启动 Web 与 API），" +
        "生产环境请确认 PM2 中的 blog-api 进程在运行（`npm run start:pm2`）。"
    );
  }
}
