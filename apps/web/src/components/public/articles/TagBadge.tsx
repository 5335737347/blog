import Link from "next/link";

interface TagBadgeProps {
  name: string;
  slug: string;
}

/**
 * 标签：默认中性色（安静、可读），hover 才出现强调色。
 * 色彩留给语义分类（见 ArticleCard 的分类胶囊），标签不再随机取色。
 */
export default function TagBadge({ name, slug }: TagBadgeProps) {
  return (
    <Link
      href={`/tags/${slug}`}
      className="inline-flex items-center rounded-full bg-bg-subtle px-2.5 py-0.5 text-micro font-medium text-ink-3 transition-colors hover:bg-primary-soft hover:text-primary-deep"
    >
      {name}
    </Link>
  );
}
