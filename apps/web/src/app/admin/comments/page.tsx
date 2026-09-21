"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import Alert from "@/components/admin/ui/Alert";
import EmptyState from "@/components/admin/ui/EmptyState";
import Button from "@/components/ui/Button";
import { readApiData, readApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

type CommentFilter = "pending" | "approved" | "all";

/** 留言板与文章评论共用一张表，审核时需要按来源分开看。 */
type ScopeFilter = "all" | "post" | "guestbook";

const scopeFilters: { value: ScopeFilter; label: string }[] = [
  { value: "all", label: "全部来源" },
  { value: "post", label: "文章评论" },
  { value: "guestbook", label: "留言板" },
];

const filters: { value: CommentFilter; label: string }[] = [
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "all", label: "全部" },
];

interface AdminComment {
  id: string;
  author: string;
  email: string | null;
  content: string;
  approved: boolean;
  createdAt: string;
  /** 留言板留言的 postId 为 null。 */
  postId: string | null;
  parentId: string | null;
  /** "guestbook" 表示来自留言板。 */
  scope: "post" | "guestbook";
  post: {
    id: string;
    title: string;
    slug: string;
  } | null;
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

function filterParam(filter: CommentFilter) {
  if (filter === "pending") return "pending";
  if (filter === "approved") return "approved";
  return "";
}

export default function CommentsAdminPage() {
  const [filter, setFilter] = useState<CommentFilter>("pending");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("error");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    const approved = filterParam(filter);
    if (approved) params.set("approved", approved);
    if (scope !== "all") params.set("scope", scope);

    try {
      const res = await fetch(`/api/comments?${params.toString()}`);
      const data = await readApiData<CommentListData>(res);
      setComments(data.items);
      setTotal(data.total);
    } catch {
      setMessageKind("error");
      setMessage("网络错误，加载评论失败");
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [filter, scope]);

  useEffect(() => {
    // setTimeout(0)：fetch 首个 await 前会同步 setLoading，直接调用会被
    // react-hooks/set-state-in-effect 视为级联渲染；延后一拍规避。
    const id = window.setTimeout(() => {
      void fetchComments();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchComments]);

  const handleModerate = async (id: string, approved: boolean) => {
    setMessage("");
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });

      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "操作失败"));
        return;
      }
      setMessageKind("success");
      setMessage(approved ? "评论已通过" : "评论已设为待审");
      await fetchComments();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，操作失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    setMessage("");
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessageKind("error");
        setMessage(await readApiError(res, "删除失败"));
        return;
      }
      setMessageKind("success");
      setMessage("评论已删除");
      await fetchComments();
    } catch {
      setMessageKind("error");
      setMessage("网络错误，删除失败");
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="评论审核"
        description={`当前筛选 ${total} 条。待审核的评论对访客不可见。`}
        actions={
          <>
            <div
              role="group"
              aria-label="来源筛选"
              className="flex gap-1 rounded-sm border border-line p-0.5"
            >
              {scopeFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setScope(item.value)}
                  className={`rounded-xs px-3 py-1.5 text-meta transition-colors ${
                    scope === item.value
                      ? "bg-primary-soft font-medium text-primary-deep"
                      : "text-ink-3 hover:bg-surface-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div
              role="group"
              aria-label="状态筛选"
              className="flex gap-1 rounded-sm border border-line p-0.5"
            >
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={`rounded-xs px-3 py-1.5 text-meta transition-colors ${
                    filter === item.value
                      ? "bg-primary-soft font-medium text-primary-deep"
                      : "text-ink-3 hover:bg-surface-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {message && <Alert variant={messageKind}>{message}</Alert>}

      {loading ? (
        <p className="text-ink-3">加载中…</p>
      ) : comments.length === 0 ? (
        <EmptyState message="暂无评论" />
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="panel p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-meta">
                <span className="font-medium text-ink">{comment.author}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-micro ${
                    comment.approved
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning"
                  }`}
                >
                  {comment.approved ? "已通过" : "待审核"}
                </span>
                {comment.parent && (
                  <span className="text-micro text-ink-3">回复 {comment.parent.author}</span>
                )}
                <time className="text-micro text-ink-3">{formatDate(comment.createdAt)}</time>
              </div>

              <p className="mb-3 whitespace-pre-wrap text-meta text-ink-2">{comment.content}</p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                {comment.scope === "guestbook" || !comment.post ? (
                  <Link
                    href="/messages"
                    className="text-micro text-ink-3 hover:text-primary-deep"
                  >
                    《留言板》
                  </Link>
                ) : (
                  <Link
                    href={`/articles/${comment.post.slug}`}
                    className="text-micro text-ink-3 hover:text-primary-deep"
                  >
                    《{comment.post.title}》
                  </Link>
                )}
                <div className="flex gap-2">
                  {!comment.approved && (
                    <Button size="sm" onClick={() => handleModerate(comment.id, true)}>
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
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(comment.id)}>
                    <span className="text-danger">删除</span>
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
