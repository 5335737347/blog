import PublicChrome from "@/components/public/layout/PublicChrome";
import NotFoundView from "@/components/public/layout/NotFoundView";

// 与公开外壳保持一致：60s 重新验证，不因为 404 页面变成每次都 SSR。
export const revalidate = 60;

/**
 * 根级 404：处理**未匹配任何路由**的 URL。
 *
 * `(public)/not-found.tsx` 只覆盖「路由匹配上了、但页面内部调用了 notFound()」
 * 的情况（例如不存在的文章 slug）。未匹配的路径（例如 /totally-unknown）此前落到
 * Next 默认 404 页面：英文文案、白底黑字、没有站点头尾。
 * 这里复用同一份外壳与同一份 404 视图，两种入口得到一致的结果。
 */
export default function RootNotFound() {
  return (
    <PublicChrome>
      <NotFoundView />
    </PublicChrome>
  );
}
