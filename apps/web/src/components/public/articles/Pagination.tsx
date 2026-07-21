"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export default function Pagination({
  currentPage,
  totalPages,
}: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const hrefFor = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav className="mt-10 flex items-center justify-center gap-1" aria-label="分页">
      {currentPage > 1 && <Link href={hrefFor(currentPage - 1)} className="pagination-link">← 上一页</Link>}
      {pages.map((page, idx) =>
        page === "..." ? (
          <span
            key={`dots-${idx}`}
            className="px-2 text-pink-300 dark:text-purple-600"
          >
            ...
          </span>
        ) : (
          <Link
            key={page}
            href={hrefFor(page)}
            aria-current={page === currentPage ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-all hover:scale-105 ${
              page === currentPage
                ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white shadow-md shadow-pink-200 dark:shadow-purple-900/30"
                : "text-purple-500 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/30"
            }`}
          >
            {page}
          </Link>
        )
      )}
      {currentPage < totalPages && <Link href={hrefFor(currentPage + 1)} className="pagination-link">下一页 →</Link>}
    </nav>
  );
}
