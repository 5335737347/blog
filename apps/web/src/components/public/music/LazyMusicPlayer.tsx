"use client";

import dynamic from "next/dynamic";
import { useMusicPlayerVisible } from "./MusicToggle";

const MusicPlayer = dynamic(() => import("./MusicPlayer"), { ssr: false });

/**
 * MusicPlayer 之前被 Header 直接引入，于是每个公开页面都会：
 *   1. 把播放器代码打进公共 layout chunk；
 *   2. 在挂载时无条件 new Audio() 并注册 7 个事件监听（MusicPlayer 的
 *      audio 初始化 effect 没有 visible 门控），即使用户从不打开播放器。
 *
 * 现在改为用户首次打开后才动态加载。「是否打开过」由 MusicProvider 记录，
 * 所以这里不需要 effect，也不会在关闭面板时卸载播放器（音乐得以继续播放）。
 */
export default function LazyMusicPlayer() {
  const { activated } = useMusicPlayerVisible();

  if (!activated) return null;
  return <MusicPlayer />;
}
