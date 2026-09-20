"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HOME_WALLPAPERS, HOME_WALLPAPER_INTERVAL_MS } from "@/config/home";
import HomeSearch from "./HomeSearch";
import { ChevronRightIcon } from "@/components/public/layout/SiteIcons";

interface HeroSectionProps {
  blogTitle: string;
  blogDescription: string;
}

/**
 * 首页沉浸首屏：整屏壁纸 + 站名 + 搜索。
 * 装饰（壁纸、遮罩、入场动画、渐变文字）只允许出现在这里。
 */
export default function HeroSection({ blogTitle, blogDescription }: HeroSectionProps) {
  const [wallpaperIndex, setWallpaperIndex] = useState(0);

  useEffect(() => {
    // 按时间戳对齐轮换，多标签页之间保持一致
    const updateWallpaper = () => {
      setWallpaperIndex(Math.floor(Date.now() / HOME_WALLPAPER_INTERVAL_MS) % HOME_WALLPAPERS.length);
    };
    const initialUpdateId = window.setTimeout(updateWallpaper, 0);
    const untilNextChange = HOME_WALLPAPER_INTERVAL_MS - (Date.now() % HOME_WALLPAPER_INTERVAL_MS);
    let intervalId: number | undefined;
    const timeoutId = window.setTimeout(() => {
      updateWallpaper();
      intervalId = window.setInterval(updateWallpaper, HOME_WALLPAPER_INTERVAL_MS);
    }, untilNextChange);
    return () => {
      window.clearTimeout(initialUpdateId);
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  const wallpaper = HOME_WALLPAPERS[wallpaperIndex] ?? HOME_WALLPAPERS[0];

  return (
    <section
      data-home-hero
      className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden bg-slate-900"
    >
      {/*
        氛围层从 `<Image fill>` 改成 CSS 背景 + blur：
        - 原来为了「模糊铺底 + 清晰前景」请求了**同一张壁纸两次**
          （第一次进首屏网络瀑布），纯属浪费；
        - CSS 背景不是 <img>，也就没有「无 width/height 的图片」这一结构性问题
          （评估中首页实测 imgNoDims=2）。
        清晰前景仍用 next/image，负责 LCP 与响应式 srcset。
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 scale-110 bg-cover bg-center opacity-70 blur-2xl"
        style={{ backgroundImage: `url(${wallpaper})` }}
      />
      <Image
        key={wallpaper}
        src={wallpaper}
        alt=""
        fill
        priority
        sizes="100vw"
        className="animate-wallpaper object-cover object-center"
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "var(--hero-scrim)" }}
        aria-hidden="true"
      />
      {/* 底部向页面底色的渐隐：消除壁纸直切白色内容区的生硬边界。 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
        style={{ backgroundImage: "linear-gradient(180deg, transparent, var(--bg))" }}
      />

      <div className="relative z-10 mx-auto w-full max-w-content px-5 py-16 sm:px-6">
        <div className="animate-fade-in-up max-w-3xl">
          <p className="mb-3 text-meta font-medium tracking-[0.16em] text-white [text-shadow:0_1px_12px_rgba(15,23,42,.75)]">
            WELCOME
          </p>
          <h1 className="text-[2rem] font-bold leading-[1.15] text-white [text-shadow:0_2px_20px_rgba(15,23,42,.75)] sm:text-[2.75rem] lg:text-6xl">
            {blogTitle}
          </h1>
          <p className="mt-4 max-w-xl text-ui leading-relaxed text-white [text-shadow:0_1px_12px_rgba(15,23,42,.8)] sm:text-base">
            {blogDescription}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-80">
              <HomeSearch />
            </div>
            <a
              href="#latest"
              className="btn inline-flex items-center gap-1.5 border border-white/30 bg-white/10 px-4 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              浏览文章
              <ChevronRightIcon className="h-4 w-4" />
            </a>
          </div>

        </div>
      </div>
    </section>
  );
}
