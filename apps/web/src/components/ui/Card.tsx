import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
  /** 可交互卡片（整块可点击）才开启 hover 态 */
  interactive?: boolean;
}

/**
 * 统一卡片：白底 + 1px 边框 + 14px 圆角，默认无阴影、无位移。
 * 悬浮只允许颜色变化，避免列表抖动。
 */
export default function Card({
  children,
  className = "",
  as: Tag = "div",
  interactive = false,
}: CardProps) {
  return (
    <Tag
      className={`rounded-md border border-line bg-surface ${
        interactive ? "transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover" : ""
      } ${className}`}
    >
      {children}
    </Tag>
  );
}
