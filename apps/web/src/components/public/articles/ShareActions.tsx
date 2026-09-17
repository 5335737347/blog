"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUpIcon, CheckIcon, HeartIcon, ShareIcon } from "@/components/public/layout/SiteIcons";

const LIKE_KEY = "kpblog:liked";
const LIKE_CHANGE_EVENT = "kpblog:like-change";

/** 点赞状态存在浏览器本地，用外部存储订阅读取，避免在 effect 里 setState。 */
function subscribeLike(onStoreChange: () => void) {
  window.addEventListener(LIKE_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(LIKE_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readLiked(): string {
  try {
    return localStorage.getItem(LIKE_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * 右侧操作栏（xl 以上显示）：点赞、分享、回到顶部。
 * 点赞只存在浏览器本地——没有服务端计数字段，不伪造数据。
 */
export default function ShareActions({ url, title }: { url: string; title: string }) {
  const likedUrl = useSyncExternalStore(subscribeLike, readLiked, () => "");
  const liked = likedUrl === url;
  const [copied, setCopied] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleLike = useCallback(() => {
    try {
      if (liked) localStorage.removeItem(LIKE_KEY);
      else localStorage.setItem(LIKE_KEY, url);
    } catch {
      /* 存储不可用时忽略 */
    }
    window.dispatchEvent(new Event(LIKE_CHANGE_EVENT));
  }, [liked, url]);

  const share = async () => {
    const shareData = { title, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 用户取消或剪贴板不可用 */
    }
  };

  return (
    <div data-print="hide" className="hidden xl:block">
      <div className="sticky top-24 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          title={liked ? "取消喜欢" : "喜欢这篇"}
          className={`icon-button ${liked ? "text-primary-deep" : ""}`}
        >
          <HeartIcon className="h-[18px] w-[18px]" fill={liked ? "currentColor" : "none"} />
        </button>
        <button type="button" onClick={share} title="分享链接" className="icon-button">
          {copied ? <CheckIcon className="h-[18px] w-[18px] text-success" /> : <ShareIcon className="h-[18px] w-[18px]" />}
        </button>
        {showTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            title="回到顶部"
            className="icon-button"
          >
            <ArrowUpIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </div>
  );
}
