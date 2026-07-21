import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "article" | "section";
}

export default function Card({
  children,
  className = "",
  as: Tag = "div",
}: CardProps) {
  return (
    <Tag
      className={`rounded-3xl border border-sky-100 bg-[--card-bg] p-6 shadow-[0_16px_50px_-38px_rgba(56,117,164,0.26)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-[0_22px_60px_-38px_rgba(77,169,232,0.42)] dark:border-purple-800/60 dark:bg-[--card-bg] ${className}`}
    >
      {children}
    </Tag>
  );
}
