import Link from "next/link";

interface TagBadgeProps {
  name: string;
  slug: string;
}

const TAG_COLORS = [
  "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-300 dark:hover:bg-pink-900/40",
  "bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/40",
  "bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/40",
  "bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
  "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/40",
  "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40",
];

function hashColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function TagBadge({ name, slug }: TagBadgeProps) {
  return (
    <Link
      href={`/tags/${slug}`}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-105 ${hashColor(slug)}`}
    >
      <span className="text-[10px]">#</span>
      {name}
    </Link>
  );
}
