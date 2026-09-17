"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface MusicContextValue {
  visible: boolean;
  /** 用户是否至少打开过一次播放器。用于决定是否动态加载 MusicPlayer。 */
  activated: boolean;
  setVisible: (v: boolean) => void;
}

const MusicContext = createContext<MusicContextValue>({
  visible: false,
  activated: false,
  setVisible: () => {},
});

export function MusicProvider({ children }: { children: ReactNode }) {
  const [visible, setVisibleState] = useState(false);
  const [activated, setActivated] = useState(false);

  // 在事件处理器里置位，而不是用 effect 同步：首次打开后保持激活，
  // 这样关闭面板时 MusicPlayer 不会被卸载，音乐可以继续播放。
  const setVisible = useCallback((v: boolean) => {
    setVisibleState(v);
    if (v) setActivated(true);
  }, []);

  const value = useMemo(
    () => ({ visible, activated, setVisible }),
    [visible, activated, setVisible]
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
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
      className={`icon-button ${
        visible
          ? "bg-primary-soft text-primary-deep"
          : ""
      }`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
      </svg>
    </button>
  );
}
