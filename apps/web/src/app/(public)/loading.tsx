/**
 * 公开页面的加载骨架。这些路由是动态渲染的（分页、标签、文章详情），
 * 之前没有任何 loading 边界，导航时要等 API 往返结束才绘制任何内容。
 */
export default function PublicLoading() {
  return (
    <div className="mx-auto w-full max-w-content animate-pulse px-5 py-12 sm:px-6" aria-busy="true" aria-live="polite">
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
