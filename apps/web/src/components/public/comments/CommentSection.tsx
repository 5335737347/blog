"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import { CommentIcon } from "@/components/public/layout/SiteIcons";
import type { CommentThreadPage, CommentWithReplies } from "@kpblog/contracts";
import { readApiData } from "@/lib/api-client";

/** 与后端默认页大小一致；后端上限为 50。 */
const PAGE_SIZE = 20;

interface CommentSectionProps {
  /** 省略即为留言板：读取 /api/public/guestbook。 */
  postId?: string;
}

interface CommentUser {
  username: string;
  displayName: string | null;
}

export default function CommentSection({ postId }: CommentSectionProps) {
  const isGuestbook = !postId;
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [currentUser, setCurrentUser] = useState<CommentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimer = useRef<number | null>(null);

  // 卸载时清理定时器，避免对已卸载组件调用 setState。
  useEffect(() => {
    return () => {
      if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    };
  }, []);

  const fetchComments = useCallback(async (targetPage: number, append: boolean) => {
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      });
      if (postId) params.set("postId", postId);
      const endpoint = postId ? "/api/comments" : "/api/public/guestbook";
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (res.ok) {
        const data = await readApiData<CommentThreadPage>(res);
        setComments((previous) => (append ? [...previous, ...data.items] : data.items));
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPage(data.page);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [postId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchComments(1, false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchComments]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? readApiData<CommentUser>(res) : null))
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  const handleSuccess = () => {
    setShowSuccess(true);
    setReplyingTo(null);
    // 新评论要重新走审核，回到第一页而不是停在当前页。
    void fetchComments(1, false);
    // 重复提交时重置而不是叠加定时器，否则旧定时器会提前清掉新提示。
    if (successTimer.current !== null) window.clearTimeout(successTimer.current);
    successTimer.current = window.setTimeout(() => {
      setShowSuccess(false);
      successTimer.current = null;
    }, 3000);
  };

  const handleLoadMore = () => {
    setLoadingMore(true);
    void fetchComments(page + 1, true);
  };

  return (
    <section>
      <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-ink">
        <CommentIcon className="h-5 w-5 text-ink-3" />
        {isGuestbook ? "留言" : "评论"}
        {total > 0 && (
          <span className="text-meta font-normal text-ink-3">({total})</span>
        )}
      </h2>

      {showSuccess && (
        <div role="status" aria-live="polite" className="mb-4 rounded-sm bg-success-soft px-4 py-2.5 text-meta text-success">
          {isGuestbook ? "留言已提交" : "评论已提交"}，审核通过后将显示。
        </div>
      )}

      <div className="mb-8">
        <CommentForm postId={postId} currentUser={currentUser} onSuccess={handleSuccess} />
      </div>

      {loading ? (
        <p className="text-meta text-ink-3">加载中...</p>
      ) : (
        <>
          <CommentList
            comments={comments}
            onReply={setReplyingTo}
            replyingTo={replyingTo}
          />
          {replyingTo && (
            <div className="ml-5 mt-4 border-l border-line pl-4">
              <p className="mb-2 text-micro text-ink-3">
                回复{isGuestbook ? "留言" : "评论"}...
              </p>
              <CommentForm
                postId={postId}
                parentId={replyingTo}
                currentUser={currentUser}
                onSuccess={handleSuccess}
                onCancel={() => setReplyingTo(null)}
              />
            </div>
          )}
          {page < totalPages && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn btn-secondary disabled:opacity-50"
              >
                {loadingMore ? "加载中..." : `加载更早的${isGuestbook ? "留言" : "评论"}`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
