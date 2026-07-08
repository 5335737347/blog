"use client";

import { useState, useEffect, useCallback } from "react";
import CommentForm from "./CommentForm";
import CommentList from "./CommentList";
import type { CommentWithReplies } from "@/types";
import { readApiData } from "@/lib/api-client";

interface CommentSectionProps {
  postId: string;
}

export default function CommentSection({ postId }: CommentSectionProps) {
  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?postId=${postId}`);
      if (res.ok) {
        const data = await readApiData<CommentWithReplies[]>(res);
        setComments(data);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchComments();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchComments]);

  const handleSuccess = () => {
    setShowSuccess(true);
    setReplyingTo(null);
    fetchComments();
    setTimeout(() => setShowSuccess(false), 3000);
  };

  return (
    <section>
      <h2 className="mb-6 text-xl font-semibold text-purple-950 dark:text-purple-50">
        💬 评论
        {comments.length > 0 && (
          <span className="ml-2 text-base font-normal text-purple-300 dark:text-purple-500">
            ({comments.length})
          </span>
        )}
      </h2>

      {showSuccess && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-300">
          评论已提交，审核通过后将显示。
        </div>
      )}

      <div className="mb-8">
        <CommentForm postId={postId} onSuccess={handleSuccess} />
      </div>

      {loading ? (
        <p className="text-sm text-purple-300 dark:text-purple-500">加载中...</p>
      ) : (
        <>
          <CommentList
            comments={comments}
            onReply={setReplyingTo}
            replyingTo={replyingTo}
          />
          {replyingTo && (
            <div className="mt-4 ml-6 border-l-2 border-pink-300 pl-4 dark:border-purple-700">
              <p className="mb-2 text-xs text-pink-400 dark:text-purple-400">
                回复评论...
              </p>
              <CommentForm
                postId={postId}
                parentId={replyingTo}
                onSuccess={handleSuccess}
                onCancel={() => setReplyingTo(null)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
