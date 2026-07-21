"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readApiData } from "@/lib/api-client";

interface AuthUser {
  authenticated: boolean;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
}

export default function AuthNav() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? readApiData<AuthUser>(res) : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/register"
          className="rounded-full bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-600 transition-colors hover:bg-pink-100 dark:bg-purple-900/30 dark:text-pink-300 dark:hover:bg-purple-900/50"
        >
          注册
        </Link>
        <Link
          href="/login"
          className="rounded-full px-3 py-1.5 text-xs font-medium text-purple-500 transition-colors hover:bg-pink-50 hover:text-pink-500 dark:text-purple-300 dark:hover:bg-purple-900/30 dark:hover:text-pink-300"
        >
          登录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="max-w-24 truncate text-xs font-medium text-purple-500 dark:text-purple-300">
        {user.displayName || user.username}
      </span>
      {user.role === "ADMIN" && (
        <Link
          href="/admin"
          className="rounded-full px-2.5 py-1 text-xs text-purple-400 transition-colors hover:bg-pink-50 hover:text-pink-500 dark:text-purple-400 dark:hover:bg-purple-900/30"
        >
          管理
        </Link>
      )}
      <button
        type="button"
        onClick={handleLogout}
        className="rounded-full px-2.5 py-1 text-xs text-purple-400 transition-colors hover:bg-pink-50 hover:text-pink-500 dark:text-purple-400 dark:hover:bg-purple-900/30"
      >
        退出
      </button>
    </div>
  );
}
