import { extractHeadings } from "@/lib/utils";

interface TocProps {
  content: string;
}

export default function TableOfContents({ content }: TocProps) {
  const headings = extractHeadings(content);
  if (headings.length < 2) return null;

  return (
    <nav className="mb-8 rounded-2xl border-2 border-pink-100 bg-pink-50/30 p-4 dark:border-purple-800/30 dark:bg-purple-950/30">
      <h3 className="mb-2 text-sm font-semibold text-purple-900 dark:text-purple-100">
        📑 目录
      </h3>
      <ul className="space-y-1">
        {headings.map((h) => (
          <li
            key={h.id}
            style={{ paddingLeft: `${(h.level - 1) * 1}rem` }}
          >
            <a
              href={`#${h.id}`}
              className="text-sm text-purple-500 hover:text-pink-500 dark:text-purple-400 dark:hover:text-pink-400 transition-colors"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
