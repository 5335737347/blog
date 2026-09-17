"use client";

import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { readApiData } from "@/lib/api-client";

export interface AuthUser {
  authenticated: boolean;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "USER";
}

/**
 * 会话外部存储。
 *
 * 为什么不是一个 useEffect + setUser：登录走的是 `router.push("/")`（客户端跳转），
 * 已挂载的组件不会重新挂载，只在挂载时读一次会话的话，登录后头部会一直显示
 * 「注册 / 登录」，直到用户硬刷新。这里改成可订阅的外部存储，
 * 登录/登出/路由变化都能主动拉取并通知所有认证 UI。
 *
 * 快照必须是稳定引用（React 会做全等比较），所以缓存 session 对象，
 * 只有数据真的变化时才换新对象。
 */
let session: AuthUser | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return session;
}

function getServerSnapshot(): AuthUser | null {
  return null;
}

/** 拉取当前会话。并发调用会复用同一个请求。 */
export function refreshSession(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // no-store：登录态不能从 HTTP 缓存读，否则登出后仍显示已登录
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const next = res.ok ? await readApiData<AuthUser>(res) : null;
      const changed =
        (session === null) !== (next === null) ||
        (session !== null && next !== null &&
          (session.username !== next.username || session.role !== next.role || session.displayName !== next.displayName));
      if (changed) {
        session = next;
        emit();
      }
    } catch {
      if (session !== null) {
        session = null;
        emit();
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export default function AuthNav() {
  const user = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // 挂载时拉一次，保证首屏就能反映真实登录态。
  // 这里不直接 setState，而是通知外部存储，符合 react-hooks/set-state-in-effect。
  useEffect(() => {
    void refreshSession();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
    } catch {
      // 请求失败时保持已登录状态，让用户可以重试，而不是显示错误的未登录界面。
      return;
    }
    session = null;
    emit();
  }, []);

  if (!user?.authenticated) {
    return (
      <div className="flex items-center gap-1.5">
        <Link href="/register" className="btn btn-primary h-8 px-3 text-meta">
          注册
        </Link>
        <Link href="/login" className="btn btn-text h-8 px-2.5 text-meta">
          登录
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/account"
        title="账号设置"
        className="max-w-24 truncate text-meta font-medium text-ink-2 transition-colors hover:text-primary-deep"
      >
        {user.displayName || user.username}
      </Link>
      {user.role === "ADMIN" && (
        <Link href="/admin" className="btn btn-text h-8 px-2 text-meta">
          管理
        </Link>
      )}
      <button type="button" onClick={handleLogout} className="btn btn-text h-8 px-2 text-meta">
        退出
      </button>
    </div>
  );
}
