"use client";

import { useSyncExternalStore } from "react";
import { LockIcon } from "@/components/public/layout/SiteIcons";

const NOTICE_COOKIE = "kp_cookie_notice";
const NOTICE_CHANGE_EVENT = "kp-cookie-notice-change";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function hasAcknowledgedNotice(): boolean {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie.startsWith(`${NOTICE_COOKIE}=`));
}

function subscribe(listener: () => void) {
  window.addEventListener(NOTICE_CHANGE_EVENT, listener);
  return () => window.removeEventListener(NOTICE_CHANGE_EVENT, listener);
}

function clientSnapshot(): boolean {
  return !hasAcknowledgedNotice();
}

function serverSnapshot(): boolean {
  return false;
}

export default function CookieNotice() {
  const visible = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  const acknowledge = () => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${NOTICE_COOKIE}=acknowledged; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax${secure}`;
    window.dispatchEvent(new Event(NOTICE_CHANGE_EVENT));
  };

  if (!visible) return null;

  // 贴底窄条：不遮挡首屏主内容（hero 搜索、文章封面）。
  //
  // 这里用 `role="region"` 而不是 `role="dialog"`：这是一条不阻塞操作的通知，
  // 不是对话框——`dialog` 在 `<aside>` 上也不是允许的 ARIA 角色
  //（axe aria-allowed-role，评估中 56/56 次运行触发）。
  return (
    <aside
      role="region"
      aria-labelledby="cookie-notice-title"
      aria-describedby="cookie-notice-description"
      data-print="hide"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-3 gap-y-2">
        <LockIcon className="hidden h-4 w-4 shrink-0 text-accent-deep sm:block" />
        <p id="cookie-notice-description" className="min-w-0 flex-1 text-micro leading-relaxed text-ink-3">
          <span id="cookie-notice-title" className="font-medium text-ink-2">
            关于本站的 Cookie：
          </span>
          <span className="hidden sm:inline">
            仅使用保持登录状态和记住本提示所需的必要 Cookie，不用于广告追踪。主题与音乐偏好只保存在你的浏览器本地。
          </span>
          <span className="sm:hidden">只用必要的登录与提示 Cookie，不做广告追踪。</span>
        </p>
        <button type="button" onClick={acknowledge} className="btn btn-primary h-8 shrink-0 px-3 text-meta">
          知道了
        </button>
      </div>
    </aside>
  );
}
