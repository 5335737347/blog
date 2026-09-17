import NotFoundView from "@/components/public/layout/NotFoundView";

/**
 * 路由组内的 404：页面内部调用 `notFound()` 时渲染（例如不存在的文章 slug）。
 * 与根级 `app/not-found.tsx` 共用同一份视图，两种入口外观一致。
 */
export default function NotFound() {
  return <NotFoundView />;
}
