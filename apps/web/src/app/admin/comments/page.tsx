"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { readApiData, readApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type CommentFilter = "pending" | "approved" | "all";

interface AdminComment {
  id: string;
  author: string;
  email: string | null;
  content: string;
  approved: boolean;
  createdAt: string;
  postId: string;
  parentId: string | null;
  post: {
    id: string;
    title: string;
    slug: string;
  };
  parent: {
    id: string;
    author: string;
  } | null;
}

interface CommentListData {
  items: AdminComment[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const filters: { value: CommentFilter; label: string }[] = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "all", label: "全部" },
];

function filterParam(filter: CommentFilter) {
  if (filter === "pending") return "pending";
  if (filter === "approved") return "approved";
  return "";
}

export default function CommentsAdminPage() {
  const [filter, setFilter] = useState<CommentFilter>("pending");
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "50" });
    const approved = filterParam(filter);
    if (approved) params.set("approved", approved);

    try {
      const res = await fetch(`/api/comments?${params.toString()}`);
      if (!res.ok) {
        setMessage(await readApiError(res, "加载评论失败"));
        setComments([]);
        return;
      }
      const data = await readApiData<CommentListData>(res);
      setComments(data.items);
    } catch {
      setMessage("网络错误，加载评论失败");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchComments();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchComments]);

  const handleModerate = async (id: string, approved: boolean) => {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });

    if (!res.ok) {
      setMessage(await readApiError(res, "操作失败"));
      return;
    }
    await fetchComments();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage(await readApiError(res, "删除失败"));
      return;
    }
    await fetchComments();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-purple-950 dark:text-purple-50">
          评论审核
          <span className="ml-2 text-sm font-normal text-purple-300 dark:text-purple-500">
            ({comments.length})
          </span>
        </h2>
        <div className="flex gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
                filter === item.value
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200"
                  : "text-purple-400 hover:bg-pink-50 dark:text-purple-500 dark:hover:bg-purple-900/20"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {message}
        </div>
      )}

      {loading ? (
        <p className="text-purple-400 dark:text-purple-500">加载中...</p>
      ) : comments.length === 0 ? (
        <p className="py-20 text-center text-purple-300 dark:text-purple-500">
          暂无评论
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-2xl border border-pink-100 bg-white p-4 dark:border-purple-800/30 dark:bg-purple-950/30"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-purple-900 dark:text-purple-100">
                  {comment.author}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    comment.approved
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                  }`}
                >
                  {comment.approved ? "已通过" : "待审核"}
                </span>
                {comment.parent && (
                  <span className="text-xs text-purple-300 dark:text-purple-500">
                    回复 {comment.parent.author}
                  </span>
                )}
                <time className="text-xs text-purple-300 dark:text-purple-500">
                  {formatDate(comment.createdAt)}
                </time>
              </div>

              <p className="mb-3 whitespace-pre-wrap text-sm text-purple-700 dark:text-purple-300">
                {comment.content}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/articles/${comment.post.slug}`}
                  className="text-xs text-purple-400 hover:text-pink-500 dark:text-purple-500 dark:hover:text-pink-400"
                >
                  《{comment.post.title}》
                </Link>
                <div className="flex gap-2">
                  {!comment.approved && (
                    <Button
                      size="sm"
                      onClick={() => handleModerate(comment.id, true)}
                    >
                      通过
                    </Button>
                  )}
                  {comment.approved && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleModerate(comment.id, false)}
                    >
                      设为待审
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(comment.id)}
                  >
                    <span className="text-red-600 dark:text-red-400">删除</span>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
