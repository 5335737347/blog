import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.min.css";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose max-w-none dark:prose-invert
      prose-headings:font-bold prose-headings:scroll-mt-20
      prose-h1:text-3xl prose-h1:text-purple-950 dark:prose-h1:text-purple-50 prose-h1:mb-6 prose-h1:pb-2 prose-h1:border-b-2 prose-h1:border-pink-100 dark:prose-h1:border-purple-800/30
      prose-h2:text-2xl prose-h2:text-purple-900 dark:prose-h2:text-purple-100 prose-h2:mt-10 prose-h2:mb-4
      prose-h3:text-xl prose-h3:text-purple-800 dark:prose-h3:text-purple-200 prose-h3:mt-8 prose-h3:mb-3
      prose-a:text-pink-500 dark:prose-a:text-pink-400 prose-a:no-underline hover:prose-a:text-purple-500
      prose-code:before:content-none prose-code:after:content-none prose-code:rounded-lg prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-pink-600 dark:prose-code:bg-purple-900/40 dark:prose-code:text-pink-300
      prose-pre:rounded-2xl prose-pre:bg-purple-950 dark:prose-pre:bg-purple-950 prose-pre:border prose-pre:border-purple-800
      prose-img:rounded-2xl
      prose-blockquote:border-pink-400 prose-blockquote:bg-pink-50/50 dark:prose-blockquote:bg-purple-900/20 prose-blockquote:rounded-r-xl
      prose-table:rounded-2xl
      prose-li:my-1
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight, rehypeSlug]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
