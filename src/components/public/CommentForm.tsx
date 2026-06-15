"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";

interface CommentFormProps {
  postId: string;
  parentId?: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export default function CommentForm({
  postId,
  parentId,
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
    if (!author.trim() || !content.trim()) {
      setError("请填写昵称和评论内容");
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
          author: author.trim(),
          email: email.trim() || null,
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "提交失败");
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
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="昵称 *"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <Input
            placeholder="邮箱（可选）"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <Textarea
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
