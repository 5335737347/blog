import type { ReactNode } from "react";

interface EmptyStateProps {
  message: string;
  /** 空状态下的引导操作（如「新建文章」链接按钮）。 */
  action?: ReactNode;
}

export default function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-ink-3">{message}</p>
      {action}
    </div>
  );
}
