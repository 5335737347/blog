import type { ReactNode } from "react";

interface PageShellProps {
  children: ReactNode;
  /** 内页统一 1200px 容器与上下留白 */
  className?: string;
  /** 窄栏内容页（about/now/messages 的正文）用 720px */
  narrow?: boolean;
}

/**
 * 内页统一外壳：不再有侧栏，也不再有玻璃面板。
 * 所有公开内页都通过它获得一致的容器宽度与上下留白。
 */
export default function PageShell({ children, className = "", narrow = false }: PageShellProps) {
  return (
    <div
      className={`mx-auto px-5 py-12 sm:px-6 sm:py-14 ${narrow ? "max-w-read" : "max-w-content"} ${className}`}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  kicker: string;
  title: string;
  description?: string;
  meta?: ReactNode;
}

/** 内页页头：kicker + H1 + 说明 + 可选元信息 */
export function PageHeader({ kicker, title, description, meta }: PageHeaderProps) {
  return (
    <header className="mb-8 border-b border-line pb-6">
      <p className="section-kicker">{kicker}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{title}</h1>
      {description && (
        <p className="mt-2.5 max-w-read text-ui leading-relaxed text-ink-2">{description}</p>
      )}
      {meta && <div className="mt-3 text-meta text-ink-3">{meta}</div>}
    </header>
  );
}
