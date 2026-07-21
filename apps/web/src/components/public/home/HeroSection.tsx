"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HOME_WALLPAPERS, HOME_WALLPAPER_INTERVAL_MS } from "@/config/home";
import HomeSearch from "./HomeSearch";

interface HeroSectionProps {
  blogTitle: string;
  blogDescription: string;
}

export default function HeroSection({ blogTitle, blogDescription }: HeroSectionProps) {
  const [wallpaperIndex, setWallpaperIndex] = useState(0);

  useEffect(() => {
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
    <section data-home-hero className="relative isolate min-h-[calc(100svh-4rem)] overflow-hidden bg-slate-900">
      <Image
        key={`blur-${wallpaper}`}
        src={wallpaper}
        alt=""
        fill
        priority
        sizes="100vw"
        className="scale-110 object-cover opacity-70 blur-2xl"
      />
      <div className="absolute inset-0 bg-black/12" />
      <Image
        key={wallpaper}
        src={wallpaper}
        alt="博客主页二次元壁纸"
        fill
        priority
        sizes="100vw"
        className="object-contain [animation:wallpaper-reveal_.8s_ease-out]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.26)_0%,rgba(15,23,42,0.05)_38%,rgba(15,23,42,0.42)_100%)]" />

      <div className="relative z-10 flex min-h-[calc(100svh-4rem)] items-center justify-center px-5 py-14 sm:px-8">
        <div className="w-full text-center text-white">
          <h1 className="text-balance text-5xl font-black tracking-[-0.05em] [text-shadow:0_4px_24px_rgba(15,23,42,0.75)] sm:text-7xl lg:text-8xl">
            {blogTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-medium tracking-[0.12em] text-white/90 [text-shadow:0_2px_12px_rgba(15,23,42,0.85)] sm:text-base">
            {blogDescription}
          </p>
          <HomeSearch />
        </div>
      </div>
    </section>
  );
}
