/**
 * 公开页面的加载骨架。这些路由是动态渲染的（分页、标签、文章详情），
 * 之前没有任何 loading 边界，导航时要等 API 往返结束才绘制任何内容。
 *
 * min-h 必须接近整屏：骨架的真实职责不只是「有东西看」，
 * 还要在内容流式到达前把页脚压出首屏——骨架只有三张卡片时（约 500px），
 * 冷加载的访客会看到页脚随内容替换猛地下坠（实测 CLS 0.24-0.34，
 * 属于 Core Web Vitals「差」档）。占满一屏后，内容替换只发生在折叠线以下，
 * 视口内没有可移动元素，CLS 回到 0。
 */
export default function PublicLoading() {
  return (
    <div className="mx-auto w-full max-w-content animate-pulse px-5 py-12 sm:px-6 sm:py-14 min-h-[calc(100svh-4rem)]" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载内容…</span>
      <div className="mb-8 h-8 w-2/5 rounded-sm bg-border" />
      <div className="flex flex-col gap-5">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="rounded-md border border-line p-5"
          >
            <div className="mb-3 h-5 w-3/5 rounded-xs bg-border" />
            <div className="mb-2 h-3.5 w-full rounded-xs bg-bg-subtle" />
            <div className="h-3.5 w-4/5 rounded-xs bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}
