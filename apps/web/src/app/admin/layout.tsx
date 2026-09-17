import AdminShell from "@/components/admin/layout/AdminShell";

/**
 * 管理端必须保持按请求动态渲染、绝不缓存。
 *
 * 公开内容的 API 改为 revalidate 之后，根 layout 不再强制整棵树动态化，
 * 管理页面会因为「服务端没有动态数据依赖」而被静态化。管理界面属于特定会话，
 * 不应进入任何共享缓存层；显式固定为 dynamic 可以避免这类回归。
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
