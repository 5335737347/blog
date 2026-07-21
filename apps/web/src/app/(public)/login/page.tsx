"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { readApiData, readApiError } from "@/lib/api-client";

interface LoginResponse {
  loggedIn: boolean;
  user: {
    role: "ADMIN" | "USER";
  };
}

export default function UserLoginPage() {
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
      router.push("/");
      router.refresh();
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm items-center px-4">
      <div className="w-full rounded-2xl border-2 border-pink-100 bg-white p-8 shadow-lg shadow-pink-100/50 dark:border-purple-800/50 dark:bg-purple-950/50 dark:shadow-purple-900/20">
        <h1 className="mb-6 text-center text-2xl font-bold text-purple-950 dark:text-purple-50">
          用户登录
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </p>
          )}
          <Input
            label="用户名、邮箱或手机号"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
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
        <p className="mt-4 text-center text-sm text-purple-400 dark:text-purple-500">
          还没有账号？{" "}
          <Link href="/register" className="text-pink-500 hover:text-purple-500">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
