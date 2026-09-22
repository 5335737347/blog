"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/public/layout/SiteIcons";

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
    <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="分页">
      {currentPage > 1 && (
        <Link href={hrefFor(currentPage - 1)} prefetch={false} className="pagination-link gap-1">
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          上一页
        </Link>
      )}
      {pages.map((page, idx) =>
        page === "..." ? (
          <span key={`dots-${idx}`} aria-hidden="true" className="px-1.5 text-ink-3">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={hrefFor(page)}
            prefetch={false}
            aria-current={page === currentPage ? "page" : undefined}
            className={`grid h-9 min-w-9 place-items-center rounded-sm px-2.5 text-meta font-medium transition-colors ${
              page === currentPage
                ? "bg-primary-solid text-on-solid"
                : "text-ink-2 hover:bg-surface-hover"
            }`}
          >
            {page}
          </Link>
        )
      )}
      {currentPage < totalPages && (
        <Link href={hrefFor(currentPage + 1)} prefetch={false} className="pagination-link gap-1">
          下一页
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      )}
    </nav>
  );
}
