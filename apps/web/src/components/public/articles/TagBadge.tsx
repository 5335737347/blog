import Link from "next/link";
import { hashTagColor } from "@/lib/utils";

interface TagBadgeProps {
  name: string;
  slug: string;
}

export default function TagBadge({ name, slug }: TagBadgeProps) {
  return (
    <Link
      href={`/tags/${slug}`}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-105 ${hashTagColor(slug)}`}
    >
      <span className="text-[10px]">#</span>
      {name}
    </Link>
  );
}
