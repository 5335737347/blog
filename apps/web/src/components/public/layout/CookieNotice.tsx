"use client";

import { useSyncExternalStore } from "react";

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

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-notice-title"
      aria-describedby="cookie-notice-description"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-2xl rounded-3xl border border-sky-100 bg-white/95 p-4 shadow-[0_24px_70px_-28px_rgba(43,95,142,0.48)] backdrop-blur-xl dark:border-purple-700/70 dark:bg-[#1b2031]/95 sm:p-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          aria-hidden="true"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-100 to-sky-100 text-xl shadow-inner dark:from-pink-900/40 dark:to-sky-900/40"
        >
          🍪
        </div>

        <div className="min-w-0 flex-1">
          <h2
            id="cookie-notice-title"
            className="text-base font-bold text-purple-950 dark:text-purple-50"
          >
            关于本站的 Cookie
          </h2>
          <p
            id="cookie-notice-description"
            className="mt-1 text-sm leading-6 text-[--muted]"
          >
            本站只使用保持登录状态和记住本提示所需的必要 Cookie，不用于广告追踪。主题、音乐音量与特效偏好仅保存在你的浏览器本地。
          </p>

          <div className="mt-4 flex items-center justify-end">
            <button
              type="button"
              onClick={acknowledge}
              className="rounded-xl bg-gradient-to-r from-pink-500 to-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200/60 transition hover:from-pink-600 hover:to-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 dark:shadow-none dark:focus:ring-offset-[#1b2031]"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
