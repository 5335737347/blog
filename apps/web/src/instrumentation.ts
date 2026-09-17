/**
 * Next 启动钩子（每个 server 进程执行一次）。
 *
 * Web 与 API 是两个独立进程：Web 通过 /api/* rewrite 代理到 API。
 * 如果 API 连不上，页面本身仍能渲染（内容会降级），但每个 /api/* 请求都会以
 * ECONNREFUSED 失败，日志里刷满 "Failed to proxy ..." 的堆栈，很难一眼看出原因。
 *
 * 这里在启动时探测一次，把结论直接说清楚。不做硬性失败：站点在设计上允许
 * API 不可用时继续提供降级页面。
 *
 * 为什么提示要写得这么细：本项目统一用 `override: false` 加载 .env，
 * **进程已有的环境变量会挡住 .env 里的值**。所以一个残留或写错的
 * API_INTERNAL_URL（例如 PM2 环境里留着的旧端口）会让 Web 永远连不上 API，
 * 而 `.env` 里正确的值根本不生效——表现是「页面能打开但内容全空」。
 * 这个形态在 2026-09-17 的部署验证里真实出现过，排查耗时不短。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const configured = process.env.API_INTERNAL_URL;
  const base = (configured || "http://127.0.0.1:3002").replace(/\/$/, "");

  try {
    const response = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const lines = [
      `[启动检查] 无法连接 API (${base})：${reason}`,
      "  · 页面仍可访问，但内容会降级（标签、分类、最新文章为空）。",
      "  · 登录、评论、搜索、音乐等 /api/* 请求会失败。",
    ];

    // 值是不是「环境注入」而非 .env 提供的，决定了排查方向完全不同。
    if (configured) {
      lines.push(
        `  · 当前 API_INTERNAL_URL 由进程环境提供（值：${configured}）。`,
        "    项目用 override:false 加载 .env，进程已有的变量会挡住 .env，",
        "    请确认它不是旧值：`pm2 env <blog-web id> | grep API_INTERNAL_URL`。"
      );
    } else {
      lines.push(
        "  · 未设置 API_INTERNAL_URL，正在使用默认值 http://127.0.0.1:3002。"
      );
    }

    // 默认端口上有服务、而配置指向别处时，几乎可以确定是变量残留。
    const fallback = "http://127.0.0.1:3002";
    if (base !== fallback) {
      try {
        const probe = await fetch(`${fallback}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (probe.ok) {
          lines.push(
            `  · 但默认地址 ${fallback} 上的 API 是健康的：`,
            "    说明 API 在跑，只是 Web 指向了别处——即上面的变量残留。"
          );
        }
      } catch {
        /* 默认地址也不通，无需补充 */
      }
    }

    lines.push(
      "  · 开发环境请用 `npm run dev`（同时启动 Web 与 API）。",
      "  · 生产环境请确认 PM2 中的 blog-api 在运行（`npm run start:pm2`）。"
    );
    console.warn(lines.join("\n"));
  }
}
