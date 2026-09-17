import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import { common } from "lowlight";
import MarkdownCodeBlock from "./MarkdownCodeBlock";
import MarkdownFigure from "./MarkdownFigure";
import "katex/dist/katex.min.css";

/**
 * 只注册 lowlight 的 common 语法集合（37 种），而不是 all（190+ 种）。
 * 注意 rehype-highlight 的 `languages` 选项要求 lowlight 的语法对象记录，
 * 传字符串数组会在注册时抛错并让整段高亮静默失效。
 * highlight.js 的别名（html→xml、js→javascript、sh→bash 等）由 common 自带。
 */
const HIGHLIGHT_OPTIONS = { languages: common, detect: false } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 把正文里的一级标题降为二级。
 *
 * 文章页的 `<h1>` 是文章标题本身（由页面渲染）。作者在 Markdown 里写 `# 小标题`
 * 完全正常，但如果原样渲染，页面就会出现**两个 h1**（评估实测所有视口 h1=2），
 * 标题层级也随之错乱。这里在 mdast 阶段把 `depth: 1` 改成 `2`，
 * 后续 rehype-slug 生成的锚点 id 不受影响，目录仍然可用。
 */
function remarkDemoteHeadings() {
  return (tree: any) => {
    const walk = (node: any) => {
      if (node?.type === "heading" && node.depth === 1) node.depth = 2;
      for (const child of node?.children ?? []) walk(child);
    };
    walk(tree);
  };
}

interface MarkdownContentProps {
  content: string;
}

interface CodeElementProps {
  className?: string;
}

function getCodeLanguage(children: ReactNode): string | undefined {
  const child = Children.toArray(children).find(isValidElement) as
    | ReactElement<CodeElementProps>
    | undefined;
  const className = child?.props.className || "";
  return className.match(/language-([\w-]+)/)?.[1];
}

function isExternalLink(href: string | undefined): boolean {
  return /^https?:\/\//i.test(href || "");
}

const markdownComponents: Components = {
  pre({ children, node, ...props }) {
    void node;
    return (
      <MarkdownCodeBlock language={getCodeLanguage(children)} {...props}>
        {children}
      </MarkdownCodeBlock>
    );
  },
  a({ href, children, node, ...props }) {
    void node;
    const external = isExternalLink(href);
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, node, ...props }) {
    void node;
    void props;
    // react-markdown 的 src 类型是 string | Blob，正文只会出现字符串地址
    if (typeof src !== "string" || !src) return null;
    return <MarkdownFigure src={src} alt={alt || ""} />;
  },
  table({ children, node, ...props }) {
    void node;
    return (
      <div className="markdown-table-scroll">
        <table {...props}>{children}</table>
      </div>
    );
  },
  input({ node, className, ...props }) {
    void node;
    return (
      <input
        className={["markdown-task-checkbox", className].filter(Boolean).join(" ")}
        {...props}
      />
    );
  },
};

export default function MarkdownContent({ content }: MarkdownContentProps) {
  // 排版全部交给 globals.css 的 .reading 规则：正文 17px/1.75、720px 阅读列、
  // 代码块/表格/引用/图片样式集中维护，不在组件里堆 prose 覆盖类。
  return (
    <div className="reading">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkDemoteHeadings]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, HIGHLIGHT_OPTIONS],
          rehypeSlug,
        ]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
