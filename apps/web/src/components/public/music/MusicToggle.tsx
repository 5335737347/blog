"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MusicContextValue {
  visible: boolean;
  setVisible: (v: boolean) => void;
}

const MusicContext = createContext<MusicContextValue>({
  visible: false,
  setVisible: () => {},
});

export function MusicProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <MusicContext.Provider value={{ visible, setVisible }}>
      {children}
    </MusicContext.Provider>
  );
}

export function useMusicPlayerVisible() {
  return useContext(MusicContext);
}

export default function MusicToggle() {
  const { visible, setVisible } = useMusicPlayerVisible();

  return (
    <button
      onClick={() => setVisible(!visible)}
      aria-label={visible ? "关闭音乐播放器" : "打开音乐播放器"}
      aria-expanded={visible}
      aria-controls="music-player-panel"
      className={`rounded-full p-2 transition-all hover:scale-110 active:scale-90 ${
        visible
          ? "text-pink-500 bg-pink-50 dark:text-pink-300 dark:bg-purple-800/50"
          : "text-pink-400 hover:bg-pink-50 dark:text-purple-300 dark:hover:bg-purple-800/50"
      }`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    </button>
  );
}
