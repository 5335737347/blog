"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";
import { refreshSession } from "@/components/public/auth/AuthNav";

interface LoginResponse {
  loggedIn: boolean;
  user: {
    role: "ADMIN" | "USER";
  };
}

export default function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });

      if (!res.ok) {
        setError(await readApiError(res, "登录失败"));
        return;
      }

      await readApiData<LoginResponse>(res);
      // 让头部等已挂载的认证 UI 立刻同步，不必等硬刷新
      await refreshSession();
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100svh-8rem)] max-w-sm items-center px-5 py-12">
      <div className="w-full rounded-md border border-line bg-surface p-6 sm:p-8">
        <h1 className="mb-6 text-center text-2xl font-bold text-ink">用户登录</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2.5 text-meta text-danger">
              {error}
            </p>
          )}
          <Input
            label="用户名或邮箱"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />
          <div className="flex flex-col gap-1">
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Link
              href="/forgot-password"
              className="self-end text-micro text-ink-3 transition-colors hover:text-primary-deep"
            >
              忘记密码？
            </Link>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
        <p className="mt-5 text-center text-meta text-ink-3">
          还没有账号？{" "}
          <Link href="/register" className="text-ink-2 underline underline-offset-2 transition-colors hover:text-primary-deep">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
