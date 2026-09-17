"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { readApiError } from "@/lib/api-client";

interface CommentFormProps {
  /** 省略即为留言板：提交到 /api/guestbook，归属由后端决定。 */
  postId?: string;
  parentId?: string;
  currentUser: {
    username: string;
    displayName: string | null;
  } | null;
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function CommentForm({
  postId,
  parentId,
  currentUser,
  onSuccess,
  onCancel,
}: CommentFormProps) {
  const isGuestbook = !postId;
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentUser && !author.trim()) {
      setError("请填写昵称");
      return;
    }
    if (!content.trim()) {
      setError(
        currentUser
          ? isGuestbook
            ? "请填写留言内容"
            : "请填写评论内容"
          : "请填写昵称和内容"
      );
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(isGuestbook ? "/api/guestbook" : "/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(postId ? { postId } : {}),
          parentId: parentId || null,
          author: currentUser ? null : author.trim(),
          email: currentUser ? null : email.trim() || null,
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "提交失败"));
      }
      setAuthor("");
      setEmail("");
      setContent("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} data-print="hide" className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-meta text-danger">{error}</p>
      )}
      {currentUser ? (
        <p className="text-micro text-ink-3">
          以 {currentUser.displayName || currentUser.username} 身份{isGuestbook ? "留言" : "评论"}
        </p>
      ) : (
        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              aria-label="昵称"
              placeholder="昵称 *"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              aria-label="邮箱（可选）"
              placeholder="邮箱（可选）"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
      )}
      <Textarea
        aria-label={parentId ? "回复内容" : isGuestbook ? "留言内容" : "评论内容"}
        placeholder={isGuestbook ? "写下你的留言..." : "写下你的评论..."}
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting} size="sm">
          {submitting ? "提交中..." : parentId ? "回复" : isGuestbook ? "发表留言" : "发表评论"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
