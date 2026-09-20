import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
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

/**
 * 标题锚点：rehype-slug 生成 id，autolink-headings 在每个标题内前置一个
 * `<a.heading-anchor>#</a>`（SSR/客户端输出一致，不会破坏水合）。
 * 显隐与定位见 globals.css 的 `.heading-anchor` 规则——hover 或键盘聚焦时出现，
 * 点击跳转到该标题（`<html data-scroll-behavior="smooth">` 提供平滑滚动，
 * 标题的 scroll-margin-top 让落点避开粘性头部）。
 * 之前只有一条 hover 伪元素装饰，提示了「可点」却点不了。
 */
const AUTOLINK_OPTIONS = {
  behavior: "prepend",
  content: { type: "text", value: "#" },
  properties: {
    className: ["heading-anchor"],
    ariaLabel: "跳转到此段落",
    tabIndex: -1,
  },
} as const;

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

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * hast 段落节点的「构成分类」：
 * - `images`：段落里有 img 子节点；
 * - `onlyImages`：除空白文本外**只有** img。
 * 必须看 hast（node.children）而不是 React children——react-markdown 传给
 * `p` 覆写的 child 元素，其 type 是 `img` 覆写函数本身（自定义组件按元素
 * 类型下发，渲染发生在父层），无法用它识别最终渲染出的 MarkdownFigure。
 */
function classifyParagraphNode(node: any): { images: any[]; onlyImages: boolean } {
  const children: any[] = node?.children ?? [];
  const meaningful = children.filter(
    (child) => !(child?.type === "text" && !String(child.value ?? "").trim()),
  );
  const images = meaningful.filter(
    (child) => child?.type === "element" && child?.tagName === "img",
  );
  return { images, onlyImages: meaningful.length > 0 && images.length === meaningful.length };
}

/**
 * 段落解包：当段落里只有图片（一张或多张）时，不再渲染 `<p>` 包裹——
 * `<figure>` 不允许出现在 `<p>` 里，浏览器解析器会擅自改写 DOM
 * （提前闭合 `<p>`），这正是文章页水合失配（React #418）与
 * 「figure cannot be a descendant of p」告警的根源。
 * 图文混排的段落保留 `<p>`，但把其中的图片降级为行内 `<img>`：
 * MarkdownFigure 渲染的 figure 无法合法地放进段落。
 */
function paragraphOverride({
  children,
  node,
  ...props
}: any & { children?: ReactNode; node?: any }) {
  const { images, onlyImages } = classifyParagraphNode(node);
  if (!images.length) return <p {...props}>{children}</p>;

  if (onlyImages) return <>{children}</>;

  // 混排：react children 与 hast children 顺序一一对应，按下标替换 img 位置
  const reactItems = Children.toArray(children);
  const hastChildren: any[] = node?.children ?? [];
  return (
    <p {...props}>
      {hastChildren.map((hastChild, index) => {
        if (hastChild?.type === "element" && hastChild?.tagName === "img") {
          const src = hastChild.properties?.src;
          return (
            <MarkdownInlineImage
              key={index}
              src={typeof src === "string" ? src : undefined}
              alt={typeof hastChild.properties?.alt === "string" ? hastChild.properties.alt : undefined}
            />
          );
        }
        return reactItems[index];
      })}
    </p>
  );
}
/**
 * 图文混排段落里的行内图片：plain <img>，不套 figure（figure 无法合法地放进 p）。
 */
function MarkdownInlineImage({ src, alt }: { src?: string; alt?: string }) {
  // 与 img 覆写同样的防御：src 非字符串（Blob 等）时不出图
  if (typeof src !== "string" || !src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ""}
      loading="lazy"
      decoding="async"
      className="inline-block h-auto max-w-full rounded-sm align-middle"
    />
  );
}

const markdownComponents: Components = {
  p: paragraphOverride,
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
          [rehypeAutolinkHeadings, AUTOLINK_OPTIONS],
        ]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
