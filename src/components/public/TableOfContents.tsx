import { extractHeadings } from "@/lib/utils";

interface TocProps {
  content: string;
}

export default function TableOfContents({ content }: TocProps) {
  const headings = extractHeadings(content);
  if (headings.length < 2) return null;

  return (
    <nav
      className="mb-8 rounded-2xl border-2 border-pink-100 bg-pink-50/30 p-4 dark:border-purple-800/30 dark:bg-purple-950/30"
      aria-label="文章目录"
    >
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
              className="block rounded-lg px-2 py-1 text-sm text-purple-500 transition-colors hover:bg-pink-50 hover:text-pink-500 dark:text-purple-400 dark:hover:bg-purple-900/30 dark:hover:text-pink-400"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
