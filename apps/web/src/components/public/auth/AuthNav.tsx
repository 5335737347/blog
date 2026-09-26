"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readApiData } from "@/lib/api-client";
import { SettingsIcon, UserIcon } from "@/components/public/layout/SiteIcons";

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

  return <AccountMenu user={user} onLogout={handleLogout} />;
}

/**
 * 登录后的头部账号区：一个下拉菜单替代「用户名 / 管理 / 退出」三个并排项。
 *
 * 顶部栏右侧还有搜索、音乐、主题三个图标，再平铺三个文字按钮会显得杂乱；
 * 收进菜单后头部只多一个触发器。菜单样式与 ThemeSelector 的弹出层保持同构。
 */
function AccountMenu({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (!open) return;
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-meta text-ink-2 transition-colors hover:bg-surface-hover";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="account-trigger btn btn-text h-8 max-w-36 gap-1.5 px-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="auth-menu"
        aria-label={`账号菜单：${user.displayName || user.username}`}
      >
        <UserIcon className="h-4 w-4 shrink-0" />
        <span className="max-w-24 truncate">{user.displayName || user.username}</span>
        <ChevronDownGlyph open={open} />
      </button>
      {open && (
        <div
          id="auth-menu"
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-md border border-line bg-surface p-1 shadow-float"
        >
          <Link role="menuitem" href="/account" onClick={() => setOpen(false)} className={itemClass}>
            <UserIcon className="h-4 w-4" />
            <span>账号中心</span>
          </Link>
          {user.role === "ADMIN" && (
            <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={itemClass}>
              <SettingsIcon className="h-4 w-4" />
              <span>管理后台</span>
            </Link>
          )}
          <div role="separator" className="my-1 border-t border-line" />
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={`${itemClass} text-danger hover:bg-danger-soft`}
          >
            <LogoutGlyph />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ChevronDownGlyph({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function LogoutGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
