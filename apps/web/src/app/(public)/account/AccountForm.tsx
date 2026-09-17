"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";

interface Session {
  authenticated: boolean;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
}

export default function AccountForm() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? readApiData<Session>(res) : null))
      .then((data) => {
        if (cancelled) return;
        setSession(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSession(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (newPassword !== confirm) {
      setMessage({ kind: "error", text: "两次输入的新密码不一致" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        setMessage({ kind: "error", text: await readApiError(res, "修改失败") });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      // 服务端已吊销全部旧令牌并为当前设备补发新令牌，这里无需重新登录。
      setMessage({ kind: "ok", text: "密码已修改。其他设备上的登录已失效，当前设备保持登录。" });
    } catch {
      setMessage({ kind: "error", text: "网络错误，请稍后重试" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-ink-3">加载中...</p>;
  }

  if (!session) {
    return (
      <div className="empty-state">
        <p className="mb-4 text-meta text-ink-2">请先登录后再管理账号。</p>
        <Link href="/login" className="primary-link">
          去登录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-3 text-ui font-semibold text-ink">
          账号信息
        </h2>
        <dl className="flex flex-col gap-1 text-meta text-ink-3">
          <div className="flex gap-2">
            <dt>用户名</dt>
            <dd className="text-ink-2">{session.username}</dd>
          </div>
          {session.displayName && (
            <div className="flex gap-2">
              <dt>昵称</dt>
              <dd className="text-ink-2">{session.displayName}</dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-micro text-ink-3">
          用户名与昵称目前不支持自助修改。
        </p>
      </section>

      <section className="rounded-md border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-4 text-ui font-semibold text-ink">
          修改密码
        </h2>
        <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
          {message && (
            <p
              role="status"
              className={`rounded-sm px-3 py-2.5 text-meta ${
                message.kind === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              {message.text}
            </p>
          )}
          <Input
            label="当前密码"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Input
            label="新密码"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="至少 8 个字符"
            required
          />
          <Input
            label="确认新密码"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "修改中..." : "修改密码"}
            </Button>
          </div>
          <p className="text-micro text-ink-3">
            修改后，该账号在所有其他设备上的登录都会失效。忘记当前密码？
            <Link href="/forgot-password" className="ml-1 text-ink-2 underline underline-offset-2 transition-colors hover:text-primary-deep">
              通过邮箱重置
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
