import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.min.css";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="prose max-w-none dark:prose-invert prose-headings:text-purple-950 dark:prose-headings:text-purple-100 prose-headings:font-bold prose-a:text-pink-500 dark:prose-a:text-pink-400 prose-a:no-underline hover:prose-a:text-purple-500 prose-code:before:content-none prose-code:after:content-none prose-code:rounded-lg prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:text-pink-600 dark:prose-code:bg-purple-900/40 dark:prose-code:text-pink-300 prose-pre:rounded-2xl prose-pre:bg-purple-950 dark:prose-pre:bg-purple-950 prose-pre:border prose-pre:border-purple-800 prose-img:rounded-2xl prose-blockquote:border-pink-400 prose-blockquote:bg-pink-50/50 dark:prose-blockquote:bg-purple-900/20 prose-blockquote:rounded-r-xl prose-table:rounded-2xl">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
