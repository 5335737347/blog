"use client";

import { useState, useEffect, useRef } from "react";
import { useMusicPlayerVisible } from "./MusicToggle";
import { readApiData } from "@/lib/api-client";

interface Track {
  id: string;
  title: string;
  artist: string | null;
  url: string;
}

export default function MusicPlayer() {
  const { visible, setVisible } = useMusicPlayerVisible();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    if (typeof window !== "undefined") {
      return parseFloat(localStorage.getItem("music-volume") || "0.5");
    }
    return 0.5;
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/music")
      .then((r) => readApiData<Track[]>(r))
      .then((data) => {
        setTracks(data);
        // Auto-play first track on load
        if (data.length > 0 && audioRef.current) {
          audioRef.current.src = data[0].url;
          audioRef.current.load();
          audioRef.current.play().catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
    }
    return () => { audioRef.current?.pause(); audioRef.current = null; };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    const track = tracks[currentIdx];
    if (!track) return;
    const wasPlaying = !audio.paused;
    audio.src = track.url;
    audio.load();
    if (wasPlaying) audio.play().catch(() => {});
  }, [currentIdx, tracks]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      localStorage.setItem("music-volume", String(volume));
    }
  }, [volume]);

  const prev = () => {
    if (tracks.length === 0) return;
    setCurrentIdx((i) => (i - 1 + tracks.length) % tracks.length);
  };

  const next = () => {
    if (tracks.length === 0) return;
    const idx = (currentIdx + 1) % tracks.length;
    setCurrentIdx(idx);
    // Auto-play when switching to next
    const audio = audioRef.current;
    if (audio && tracks[idx]) {
      audio.play().catch(() => {});
    }
  };

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [visible, setVisible]);

  return (
    <div
      ref={panelRef}
      className={`absolute left-1/2 top-full mt-2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border-2 border-pink-200 bg-white/95 px-4 py-2.5 shadow-xl shadow-pink-100/50 backdrop-blur-sm transition-all duration-200 dark:border-purple-800/50 dark:bg-purple-950/95 dark:shadow-purple-900/30 ${
        visible
          ? "translate-y-0 opacity-100 scale-100"
          : "-translate-y-2 opacity-0 scale-95 pointer-events-none"
      }`}
    >
      {tracks.length === 0 ? null : (
        <>
          <button
            onClick={prev}
            className="text-pink-400 hover:text-pink-600 dark:text-purple-400 dark:hover:text-pink-400 transition-colors"
            title="上一首"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button
            onClick={next}
            className="text-pink-400 hover:text-pink-600 dark:text-purple-400 dark:hover:text-pink-400 transition-colors"
            title="下一首"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-pink-300 dark:text-purple-500">🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolumeState(parseFloat(e.target.value))}
          className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-pink-200 accent-pink-400 dark:bg-purple-800 dark:accent-purple-400"
        />
      </div>
    </div>
  );
}
