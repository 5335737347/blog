"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { apiErrorMessage, readApiData } from "@/lib/api-client";

interface LoginResponse {
  loggedIn: boolean;
  user: {
    role: "ADMIN" | "USER";
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [lockedFor, setLockedFor] = useState(0);
  const [loading, setLoading] = useState(false);

  /**
   * 登录被锁定时的倒计时。
   *
   * 服务端在 429 响应里带 `error.retryAfterSeconds`（管理员账号连续 3 次密码错误
   * 就进入冷却，冷却期内即使密码正确也拒绝）。这里把它显示成剩余时间，
   * 避免用户对着同一句「请求过于频繁」反复尝试。
   */
  const locked = lockedFor > 0;
  useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => {
      setLockedFor((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLockedFor(0);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await readApiData<LoginResponse>(res);
        if (data.user.role !== "ADMIN") {
          await fetch("/api/auth/logout", { method: "POST" });
          setError("当前账号不是管理员");
          return;
        }
        router.push("/admin");
      } else {
        // body 只能读一次：先取下来，再同时拿出文案与剩余秒数。
        // 之前这里先 res.json() 再 readApiError(res.clone())，clone 会抛
        // TypeError（Body has already been consumed），于是 401/429 被显示成
        // 「网络错误」——把「用户名或密码错误」和锁定倒计时全盖掉了。
        const payload = await res.json().catch(() => null);
        const retryAfter = Number(
          (payload as { error?: { retryAfterSeconds?: number } } | null)?.error?.retryAfterSeconds
        );
        setError(apiErrorMessage(payload, "登录失败"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) setLockedFor(Math.ceil(retryAfter));
      }
    } catch (error) {
      // 区分「请求根本没发出去/被中断」和「响应到了但处理出错」：
      // 一律显示「网络错误」会掩盖真实原因，排查时只能靠猜。
      console.error("[admin/login] 登录请求失败:", error);
      setError("网络错误，请检查网络连接后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-purple-200 bg-white p-8 shadow-sm dark:border-purple-800/50 dark:bg-purple-950/50">
        <h1 className="mb-6 text-center text-2xl font-bold text-purple-950 dark:text-purple-50">
          🔐 管理员登录
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
            >
              {error}
              {lockedFor > 0 && (
                <span className="mt-1 block font-medium">
                  请在 {Math.ceil(lockedFor / 60)} 分钟后重试
                  （剩余 {Math.floor(lockedFor / 60)}:
                  {String(lockedFor % 60).padStart(2, "0")}）
                </span>
              )}
            </p>
          )}
          <Input
            label="用户名"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>
      </div>
    </div>
  );
}
