"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
}

export default function Pagination({
  currentPage,
  totalPages,
}: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "/");
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
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="rounded-xl px-3 py-2 text-sm text-purple-500 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-20 transition-all"
      >
        ← 前へ
      </button>
      {pages.map((page, idx) =>
        page === "..." ? (
          <span
            key={`dots-${idx}`}
            className="px-2 text-pink-300 dark:text-purple-600"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => goToPage(page)}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-all hover:scale-105 ${
              page === currentPage
                ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white shadow-md shadow-pink-200 dark:shadow-purple-900/30"
                : "text-purple-500 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/30"
            }`}
          >
            {page}
          </button>
        )
      )}
      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="rounded-xl px-3 py-2 text-sm text-purple-500 hover:bg-pink-50 dark:text-purple-400 dark:hover:bg-purple-900/30 disabled:opacity-20 transition-all"
      >
        次へ →
      </button>
    </nav>
  );
}
