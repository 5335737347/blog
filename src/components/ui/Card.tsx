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
      className={`rounded-2xl border border-pink-100 bg-white p-6 shadow-sm shadow-pink-100/50 transition-all duration-300 hover:shadow-md hover:shadow-pink-100/80 hover:-translate-y-0.5 dark:border-purple-800/50 dark:bg-purple-950/40 dark:shadow-purple-900/20 ${className}`}
    >
      {children}
    </Tag>
  );
}
