import PublicChrome from "@/components/public/layout/PublicChrome";

// 公开外壳不读取 cookies/headers，可以静态化并按 60s 重新验证，
// 避免每次浏览都重新 SSR 并重复拉取设置。
export const revalidate = 60;

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
