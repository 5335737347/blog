"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";

interface ResetCodeResponse {
  requested: boolean;
  expiresAt: string;
  debugCode?: string;
}

/**
 * 忘记密码：两步式重置。
 *
 * 第一步只负责发码；服务端对「邮箱是否已注册」返回完全相同的响应，
 * 因此这里也不做任何存在性提示。
 */
export default function ForgotPasswordForm() {
  const [stage, setStage] = useState<"request" | "reset" | "done">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [debugCode, setDebugCode] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "发送失败"));
        return;
      }
      const data = await readApiData<ResetCodeResponse>(res);
      setDebugCode(data.debugCode);
      setStage("reset");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verificationCode: code, newPassword: password }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "重置失败"));
        return;
      }
      setStage("done");
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-sm items-center px-5 py-12">
      <div className="w-full rounded-md border border-line bg-surface p-6 sm:p-8">
        <h1 className="mb-6 text-center text-2xl font-bold text-ink">
          重置密码
        </h1>

        {error && (
          <p role="alert" className="mb-4 rounded-sm bg-danger-soft px-3 py-2.5 text-meta text-danger">
            {error}
          </p>
        )}

        {stage === "request" && (
          <form onSubmit={handleRequest} className="flex flex-col gap-4">
            <p className="text-meta leading-relaxed text-ink-3">
              输入注册时使用的邮箱，我们会发送一个 6 位验证码。
            </p>
            <Input
              label="邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "发送中..." : "发送验证码"}
            </Button>
          </form>
        )}

        {stage === "reset" && (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
            <p className="text-meta leading-relaxed text-ink-3">
              验证码已发送到 <span className="text-ink-2">{email}</span>，
              10 分钟内有效。
            </p>
            {debugCode && (
              <p className="rounded-sm bg-warning-soft px-3 py-2.5 text-meta text-warning">
                开发模式（未配置 SMTP）：验证码为 {debugCode}
              </p>
            )}
            <Input
              label="验证码"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
              required
            />
            <Input
              label="新密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "重置中..." : "重置密码"}
            </Button>
            <button
              type="button"
              className="text-center text-meta text-ink-3 transition-colors hover:text-primary-deep"
              onClick={() => {
                setStage("request");
                setCode("");
                setError("");
              }}
            >
              换个邮箱
            </button>
          </form>
        )}

        {stage === "done" && (
          <div className="flex flex-col gap-4 text-center">
            <p role="status" className="rounded-sm bg-success-soft px-3 py-2.5 text-meta text-success">
              密码已重置。为了安全，你在所有设备上的登录都已失效，请重新登录。
            </p>
            <Link href="/login" className="primary-link w-full">
              去登录
            </Link>
          </div>
        )}

        {stage !== "done" && (
          <p className="mt-5 text-center text-meta text-ink-3">
            想起来了？{" "}
            <Link href="/login" className="text-ink-2 underline underline-offset-2 transition-colors hover:text-primary-deep">
              返回登录
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
