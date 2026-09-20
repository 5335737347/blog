import type { ReactNode } from "react";
import TableOfContents from "../articles/TableOfContents";
import ReadingProgressBar from "../articles/ReadingProgressBar";
import ShareActions from "../articles/ShareActions";
import { extractHeadings } from "@/lib/utils";

interface ArticleReaderProps {
  /** 用于生成目录的 Markdown 原文 */
  content: string;
  /** 用于分享与复制链接的完整地址 */
  articleUrl: string;
  /** 文章标题，用于分享面板 */
  title: string;
  children: ReactNode;
}

/**
 * 文章阅读器骨架：目录（左）/ 正文（中）/ 操作栏（右，xl 起）。
 * 目录不再插在标题与正文之间——那是长文阅读的主要干扰源。
 */
export default function ArticleReader({ content, articleUrl, title, children }: ArticleReaderProps) {
  const headings = extractHeadings(content);

  return (
    <div className="mx-auto max-w-content px-5 py-10 sm:px-6 sm:py-12">
      <ReadingProgressBar />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[200px_720px_44px] xl:gap-12 xl:justify-center">
        <TableOfContents headings={headings} />
        <div className="min-w-0">{children}</div>
        <ShareActions url={articleUrl} title={title} />
      </div>
    </div>
  );
}
