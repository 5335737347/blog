import type { ReactNode } from "react";

interface AdminPageHeaderProps {
  title: string;
  /** 一句话说明这一页管什么，可选。 */
  description?: string;
  /** 标题右侧的操作区（新建按钮等）。 */
  actions?: ReactNode;
}

/**
 * 后台统一的页头：替代此前每页手写的 emoji 标题行，
 * 标题、说明与操作区（新建/筛选）的排布全站一致。
 */
export default function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-meta text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
