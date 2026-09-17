"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HOME_WALLPAPERS, HOME_WALLPAPER_INTERVAL_MS } from "@/config/home";
import HomeSearch from "./HomeSearch";
import { ChevronRightIcon, SearchIcon } from "@/components/public/layout/SiteIcons";

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
      {/* 背景模糊氛围层：填满拉伸，避免裁切导致露底 */}
      <Image
        key={`blur-${wallpaper}`}
        src={wallpaper}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-110 object-cover opacity-70 blur-2xl"
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

      <div className="relative z-10 mx-auto w-full max-w-content px-5 py-16 sm:px-6">
        <div className="animate-fade-in-up max-w-3xl">
          <p className="mb-3 text-meta font-medium tracking-[0.16em] text-white/75">
            WELCOME
          </p>
          <h1 className="text-[2rem] font-bold leading-[1.15] text-white [text-shadow:0_2px_20px_rgba(15,23,42,.6)] sm:text-[2.75rem] lg:text-6xl">
            {blogTitle}
          </h1>
          <p className="mt-4 max-w-xl text-ui leading-relaxed text-white/85 [text-shadow:0_1px_10px_rgba(15,23,42,.7)] sm:text-base">
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

          <p className="mt-6 inline-flex items-center gap-2 text-micro text-white/70">
            <SearchIcon className="h-3.5 w-3.5" />
            按 Enter 直接搜索，支持标题、标签与正文关键词
          </p>
        </div>
      </div>
    </section>
  );
}
