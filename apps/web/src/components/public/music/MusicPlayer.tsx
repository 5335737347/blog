"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useMusicPlayerVisible } from "./MusicToggle";
import { readApiData } from "@/lib/api-client";

interface Track {
  id: string;
  title: string;
  artist: string | null;
  url: string;
}

const VOLUME_KEY = "music-volume";
const VOLUME_EVENT = "kp-music-volume-change";

function subscribeVolume(listener: () => void) {
  window.addEventListener(VOLUME_EVENT, listener);
  return () => window.removeEventListener(VOLUME_EVENT, listener);
}

/**
 * 这个函数会作为 useSyncExternalStore 的 getSnapshot 在渲染期间被调用。
 * 一旦 localStorage 抛异常（Safari 隐私模式、存储被禁用或超额），异常会冒泡到
 * 整个渲染过程，而 MusicPlayer 位于 Header 内，等于整个公开布局崩溃。
 * 因此这里必须吞掉异常并退回默认音量。
 */
function volumeSnapshot() {
  try {
    const stored = Number.parseFloat(localStorage.getItem(VOLUME_KEY) || "0.5");
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 0.5;
  } catch {
    return 0.5;
  }
}

function serverVolumeSnapshot() {
  return 0.5;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function MusicPlayer() {
  const { visible, setVisible } = useMusicPlayerVisible();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const volume = useSyncExternalStore(
    subscribeVolume,
    volumeSnapshot,
    serverVolumeSnapshot
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || loaded) return;
    fetch("/api/music")
      .then((r) => readApiData<Track[]>(r))
      .then((data) => {
        setTracks(data);
        setLoaded(true);
      })
      .catch(() => {
        setTracks([]);
        setLoaded(true);
      });
  }, [loaded, visible]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "metadata";
    }
    const audio = audioRef.current;
    const onPlay = () => {
      playingRef.current = true;
      setPlaying(true);
    };
    const onPause = () => {
      playingRef.current = false;
      setPlaying(false);
    };
    const onEnded = () => setCurrentIdx((index) => tracks.length ? (index + 1) % tracks.length : 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEmptied = () => {
      setCurrentTime(0);
      setDuration(0);
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("emptied", onEmptied);
    return () => {
      audio.pause();
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("emptied", onEmptied);
      audioRef.current = null;
    };
  }, [tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const track = tracks[currentIdx];
    if (!track) return;
    const shouldResume = playingRef.current;
    audio.src = track.url;
    audio.load();
    if (shouldResume) audio.play().catch(() => setPlaying(false));
  }, [currentIdx, tracks]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const setVolume = (value: number) => {
    try {
      localStorage.setItem(VOLUME_KEY, String(value));
    } catch {
      // 存储不可用时音量仍然在本次会话内生效，只是不会被记住。
    }
    window.dispatchEvent(new Event(VOLUME_EVENT));
  };

  const prev = () => {
    if (tracks.length === 0) return;
    setCurrentIdx((i) => (i - 1 + tracks.length) % tracks.length);
  };

  const next = () => {
    if (tracks.length === 0) return;
    setCurrentIdx((i) => (i + 1) % tracks.length);
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    const track = tracks[currentIdx];
    if (!audio || !track) return;
    if (!audio.src) {
      audio.src = track.url;
      audio.load();
    }
    if (audio.paused) {
      await audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    if (!audioRef.current || duration <= 0) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  // Close on click outside, and on Escape for keyboard users.
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVisible(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [visible, setVisible]);

  // 打开时把焦点移入对话框，关闭时还给触发按钮，避免键盘用户丢失位置。
  useEffect(() => {
    if (!visible) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus?.();
  }, [visible]);

  if (!visible) return null;

  const currentTrack = tracks[currentIdx];
  const loading = !loaded;
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volumeProgress = volume * 100;

  return (
    <div
      id="music-player-panel"
      ref={panelRef}
      role="dialog"
      aria-label="音乐播放器"
      data-print="hide"
      tabIndex={-1}
      className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-line bg-surface shadow-float outline-none"
    >
      {loading ? (
        <p className="px-5 py-8 text-meta text-ink-3">正在加载音乐…</p>
      ) : tracks.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <p className="text-ui font-semibold text-ink">播放列表还是空的</p>
          <p className="mt-1 text-micro text-ink-3">在后台添加音乐后就会出现在这里。</p>
        </div>
      ) : (
        <div>
          <div className="border-b border-line bg-bg-subtle px-5 pb-5 pt-4">
            <div className="relative flex items-center justify-between">
              <p className="text-micro font-semibold uppercase tracking-[0.16em] text-ink-3">
                Now playing
              </p>
              <button
                type="button"
                onClick={() => setVisible(false)}
                aria-label="关闭音乐播放器"
                className="icon-button h-7 w-7"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="relative mt-2 flex items-center gap-4">
              <div
                aria-hidden="true"
                className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_center,#fff_0_8%,#ef5f7a_9%_13%,#28344b_14%_28%,#111827_29%_42%,#334155_43%_44%,#111827_45%_100%)] ${playing ? "animate-[spin_8s_linear_infinite]" : ""}`}
              >
                <span className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-ui font-semibold text-ink">
                  {currentTrack?.title}
                </p>
                <p className="mt-1 truncate text-meta text-ink-3">
                  {currentTrack?.artist || "未知艺术家"}
                </p>
                <p className="mt-2 text-micro font-medium tabular-nums text-ink-3">
                  {currentIdx + 1} / {tracks.length}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-4">
            <input
              aria-label="播放进度"
              type="range"
              min="0"
              max={duration > 0 ? duration : 1}
              step="0.1"
              value={duration > 0 ? Math.min(currentTime, duration) : 0}
              onChange={(event) => seek(Number.parseFloat(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[var(--primary)]"
              style={{
                background: `linear-gradient(to right, var(--primary) ${progress}%, var(--border) ${progress}%)`,
              }}
            />
            <div className="mt-1.5 flex justify-between text-micro font-medium tabular-nums text-ink-3">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <div className="mt-1 flex items-center justify-center gap-5">
              <button
                type="button"
                onClick={prev}
                aria-label="上一首"
                className="icon-button"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 5h2v14H6zm3.5 7 9 6V6z" />
                </svg>
              </button>

              <button
                type="button"
                onClick={togglePlayback}
                aria-label={playing ? "暂停" : "播放"}
                className="grid h-12 w-12 place-items-center rounded-full bg-primary-solid text-on-solid transition-colors hover:bg-primary-deep"
              >
                {playing ? (
                  <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" className="ml-0.5 h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={next}
                aria-label="下一首"
                className="icon-button"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.5 18l9-6-9-6zm10.5-13h2v14h-2z" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-sm bg-bg-subtle px-3 py-2.5">
              <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6.5 9H3v6h3.5l4.5 4V5Zm4.5 4a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10" />
              </svg>
              <input
                aria-label="音乐音量"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(event) => setVolume(Number.parseFloat(event.target.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-[var(--accent)]"
                style={{
                  background: `linear-gradient(to right, var(--accent) ${volumeProgress}%, var(--border) ${volumeProgress}%)`,
                }}
              />
              <span className="w-8 text-right text-micro font-medium tabular-nums text-ink-3">
                {Math.round(volumeProgress)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
