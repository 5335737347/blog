"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { readApiError } from "@/lib/api-client";

interface CommentFormProps {
  postId: string;
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
      setError(currentUser ? "请填写评论内容" : "请填写昵称和评论内容");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {currentUser ? (
        <p className="text-xs text-purple-400 dark:text-purple-500">
          以 {currentUser.displayName || currentUser.username} 身份评论
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
        aria-label={parentId ? "回复内容" : "评论内容"}
        placeholder="写下你的评论..."
        rows={4}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting} size="sm">
          {submitting ? "提交中..." : parentId ? "回复" : "发表评论"}
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
